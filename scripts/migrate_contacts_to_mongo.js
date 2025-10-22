#!/usr/bin/env node
/*
Lightweight migration script:
- Reads contacts from MySQL, deduplicates them, upserts into MongoDB `contacts` collection
- Reads user->contact relations from MySQL and upserts into MongoDB `user_contacts` linking collection
- Optional: populate `users.contact_ids` as denormalized cache

Usage examples:
  node scripts/migrate_contacts_to_mongo.js --mysql-uri mysql://... --mongo-uri mongodb://... --dry-run
  node scripts/migrate_contacts_to_mongo.js --mysql-uri ... --mongo-uri ... --populate-user-contact-ids

This script is intentionally conservative and idempotent (uses upserts and dedupe keys).
*/

const { program } = require('commander');
const mysql = require('mysql2/promise');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

program
  .option('--mysql-uri <uri>')
  .option('--mongo-uri <uri>')
  .option('--contacts-table <name>', 'contacts table name', 'contact')
  .option('--contacts-id-field <name>', 'contacts primary key field', 'id')
  .option('--user-contacts-table <name>', 'user->contact relation table', 'user_contacts')
  .option('--user-contacts-user-field <name>', 'user id field in link table', 'user_id')
  .option('--user-contacts-contact-field <name>', 'contact id field in link table', 'contact_id')
  .option('--users-table <name>', 'users table name', 'users')
  .option('--batch-size <n>', 'batch size for source reads', parseInt, 1000)
  .option('--dry-run', 'do not write to MongoDB', false)
  .option('--populate-user-contact-ids', 'populate users.contact_ids after linking', false)
  .option('--limit <n>', 'limit rows for quick tests', parseInt)
  .parse(process.argv);

const opts = program.opts();

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/\D+/g, '') || null;
}

function dedupeKeyForRow(row) {
  // prefer email, then phone, then hash(name+phone)
  if (row.email) return `email:${String(row.email).trim().toLowerCase()}`;
  const phone = normalizePhone(row.phone) || normalizePhone(row.mobile) || null;
  if (phone) return `phone:${phone}`;
  const name = (row.name || row.full_name || '') + '|' + (row.phone || row.mobile || '');
  return 'hash:' + crypto.createHash('sha256').update(name).digest('hex').slice(0, 16);
}

async function main() {
  if (!opts.mysqlUri || !opts.mongoUri) {
    console.error('Please provide --mysql-uri and --mongo-uri');
    process.exit(2);
  }

  const batchSize = opts.batchSize || 1000;

  const mysqlConn = await mysql.createConnection(opts.mysqlUri);
  const mongoClient = new MongoClient(opts.mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db();

  const contactsColl = db.collection('contacts');
  const userContactsColl = db.collection('user_contacts');
  const usersColl = db.collection('users');

  // Ensure indexes (idempotent)
  await Promise.all([
    contactsColl.createIndex({ dedupeKey: 1 }, { unique: true, sparse: true }).catch(() => {}),
    userContactsColl.createIndex({ user_id: 1 }),
    userContactsColl.createIndex({ contact_id: 1 }),
    userContactsColl.createIndex({ user_id: 1, contact_id: 1 }, { unique: true, sparse: true }).catch(() => {}),
  ]);

  const srcIdToMongoId = new Map();
  let insertedContacts = 0;
  let upsertedContacts = 0;

  console.log('Starting contacts migration. dryRun=', !!opts.dryRun);

  // Read contacts in batches
  let offset = 0;
  let totalContacts = 0;
  while (true) {
    let q = `SELECT * FROM \`${opts.contactsTable}\` LIMIT ${batchSize} OFFSET ${offset}`;
    if (opts.limit) q = `SELECT * FROM \`${opts.contactsTable}\` LIMIT ${Math.min(batchSize, opts.limit - offset)} OFFSET ${offset}`;
    const [rows] = await mysqlConn.query(q).catch(err => { console.error('Error querying contacts:', err.message); return [ [] ]; });
    if (!rows || rows.length === 0) break;
    totalContacts += rows.length;
    for (const row of rows) {
      const srcId = row[opts.contactsIdField] || row.id || row.contact_id || row._id || null;
      const key = dedupeKeyForRow(row);
      if (opts.dryRun) {
        srcIdToMongoId.set(String(srcId), `<dedupe:${key}>`);
      } else {
        const doc = {
          dedupeKey: key,
          name: row.name || row.full_name || row.display_name || null,
          email: row.email || null,
          phone: row.phone || row.phone_no || null,
          mobile: row.mobile || row.mobile_no || null,
          designation: row.designation || null,
          department: row.department || null,
          isEnabled: row.isEnabled || row.is_enabled || null,
          meta: { source: 'mysql', sourceId: srcId },
        };
        // Upsert by dedupeKey
        const res = await contactsColl.findOneAndUpdate(
          { dedupeKey: key },
          { $set: doc, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, returnDocument: 'after' }
        );
        const mongoId = res.value && res.value._id ? res.value._id.toString() : null;
        if (res.lastErrorObject && res.lastErrorObject.upserted) insertedContacts++;
        else upsertedContacts++;
        if (srcId != null && mongoId) srcIdToMongoId.set(String(srcId), mongoId);
      }
    }
    offset += rows.length;
    if (opts.limit && offset >= opts.limit) break;
    if (rows.length < batchSize) break;
    process.stdout.write(`.`);
  }
  console.log('\nContacts scanned:', totalContacts, 'inserted:', insertedContacts, 'upserted:', upsertedContacts);

  // Process linking table
  let offsetL = 0;
  let createdLinks = 0;
  let skippedLinks = 0;
  while (true) {
    let q = `SELECT * FROM \`${opts.userContactsTable}\` LIMIT ${batchSize} OFFSET ${offsetL}`;
    if (opts.limit) q = `SELECT * FROM \`${opts.userContactsTable}\` LIMIT ${Math.min(batchSize, opts.limit - offsetL)} OFFSET ${offsetL}`;
    const [rows] = await mysqlConn.query(q).catch(err => { console.error('Error querying user_contacts:', err.message); return [ [] ]; });
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      const srcContactId = row[opts.userContactsContactField] || row.contact_id || row.contactId || null;
      const userId = row[opts.userContactsUserField] || row.user_id || row.userId || null;
      const relation = row.relation_type || row.type || null;
      const isPrimary = row.is_primary != null ? !!row.is_primary : null;
      const mappedContactId = srcIdToMongoId.get(String(srcContactId));
      if (!mappedContactId) { skippedLinks++; console.warn('Missing contact mapping for srcId', srcContactId); continue; }
      if (opts.dryRun) { createdLinks++; continue; }
      const filter = { user_id: String(userId), contact_id: mappedContactId, relation_type: relation };
      const update = { $set: { user_id: String(userId), contact_id: mappedContactId, relation_type: relation, is_primary: isPrimary, meta: { source: 'mysql', sourceContactId: srcContactId } } };
      const res = await userContactsColl.updateOne(filter, update, { upsert: true });
      if (res.upsertedCount) createdLinks++; else skippedLinks++;
    }
    offsetL += rows.length;
    if (opts.limit && offsetL >= opts.limit) break;
    if (rows.length < batchSize) break;
    process.stdout.write(`.`);
  }
  console.log('\nLinks created:', createdLinks, 'skipped:', skippedLinks);

  // Optionally populate users.contact_ids
  let usersUpdated = 0;
  if (opts.populateUserContactIds && !opts.dryRun) {
    console.log('Populating users.contact_ids from user_contacts...');
    // aggregate user_contacts to group contact_ids per user
    const cursor = userContactsColl.aggregate([
      { $group: { _id: '$user_id', contact_ids: { $addToSet: '$contact_id' } } }
    ]);
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const res = await usersColl.updateOne({ _id: doc._id }, { $addToSet: { contact_ids: { $each: doc.contact_ids } } });
      if (res.matchedCount) usersUpdated++;
    }
    console.log('Users updated with contact_ids:', usersUpdated);
  }

  await mysqlConn.end();
  await mongoClient.close();
  console.log('Migration complete. Summary:');
  console.log({ totalContacts, insertedContacts, upsertedContacts, createdLinks, skippedLinks, usersUpdated });
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
