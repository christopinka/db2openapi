Migration scripts
=================

scripts/migrate_contacts_to_mongo.js
- Purpose: migrate contacts and user->contact relations from MySQL into MongoDB.
- Usage (dry-run):
  node scripts/migrate_contacts_to_mongo.js --mysql-uri mysql://user:pass@host/db --mongo-uri mongodb://user:pass@host/db --dry-run
- Usage (real run):
  node scripts/migrate_contacts_to_mongo.js --mysql-uri mysql://... --mongo-uri mongodb://... --populate-user-contact-ids

Options include batch size, limit for testing, and table/field name overrides.
