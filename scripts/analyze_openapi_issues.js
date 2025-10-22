#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(process.cwd(), 'openapi-mysql.json');
if (!fs.existsSync(file)) {
  console.error('OpenAPI file not found:', file);
  process.exit(2);
}

const json = JSON.parse(fs.readFileSync(file, 'utf8'));
const schemas = (json.components && json.components.schemas) || {};

const isBoolName = /^(is|has|should|enabled|active|flag|is_|has_)/i;
const results = [];

for (const [name, schema] of Object.entries(schemas)) {
  if (!schema || !schema.properties) continue;
  for (const [prop, def] of Object.entries(schema.properties)) {
    const entry = { schema: name, prop };
    // integer fields that look like booleans
    if ((def.type === 'integer' || (Array.isArray(def.type) && def.type.includes('integer'))) ) {
      if (isBoolName.test(prop) || (def.default === '0' || def.default === '1' || def.example === 0 || def.example === 1)) {
        entry.issue = 'integer-likely-boolean';
        entry.suggestion = 'Consider mapping to boolean in the API model';
        results.push(entry);
        continue;
      }
    }

    // email without format
    if ((prop.toLowerCase().includes('email') || prop.toLowerCase().includes('email_id')) && def.type && (def.type === 'string' || (Array.isArray(def.type) && def.type.includes('string'))) && (!def.format || def.format !== 'email')) {
      results.push({ schema: name, prop, issue: 'email-missing-format', suggestion: 'Add format: email' });
      continue;
    }

    // uuid-like names without format
    if (prop.toLowerCase().includes('uuid') && def.type && (def.type === 'string' || (Array.isArray(def.type) && def.type.includes('string'))) && (!def.format || def.format !== 'uuid')) {
      results.push({ schema: name, prop, issue: 'uuid-missing-format', suggestion: 'Add format: uuid' });
      continue;
    }

    // string fields that look numeric
    if ((def.type === 'string' || (Array.isArray(def.type) && def.type.includes('string'))) && def.example && /^\d+$/.test(String(def.example))) {
      results.push({ schema: name, prop, issue: 'string-numeric-example', suggestion: 'Verify type is correct; consider number/integer' });
      continue;
    }
  }
}

if (results.length === 0) {
  console.log('No obvious mapping issues found.');
  process.exit(0);
}

console.log('Found', results.length, 'potential issues:');
for (const r of results) {
  console.log(`- ${r.schema}.${r.prop}: ${r.issue} — ${r.suggestion || ''}`);
}

// exit with success (non-zero could be used but keep zero)
process.exit(0);
