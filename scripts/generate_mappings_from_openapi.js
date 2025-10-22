#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const openapiPath = process.argv[2] || path.join(process.cwd(), 'openapi-mysql-fixed.json');
const outPath = process.argv[3] || path.join(process.cwd(), 'mappings.generated.json');

if (!fs.existsSync(openapiPath)) { console.error('OpenAPI file not found:', openapiPath); process.exit(2); }
const openapi = JSON.parse(fs.readFileSync(openapiPath));
const comps = openapi.components && openapi.components.schemas ? openapi.components.schemas : {};
const result = { components: {} };

const booleanPrefixes = ['is','has','should','enable','enabled','active','isEnabled','is_enabled','is_enabled'];
for (const [schemaName, schema] of Object.entries(comps)) {
  if (!schema.properties) continue;
  const props = {};
  for (const [pname, pdef] of Object.entries(schema.properties)) {
    const lower = pname.toLowerCase();
    // uuid heuristics
    if (lower.includes('uuid') || lower.endsWith('_uuid') || lower.endsWith('uuid')) {
      // only apply if the property type includes string
      const types = Array.isArray(pdef.type) ? pdef.type : [pdef.type];
      if (types.includes('string') || types.includes(undefined)) {
        props[pname] = Object.assign({}, props[pname], { format: 'uuid' });
      }
    }
    // email heuristics
    if (lower === 'email' || lower.endsWith('_email') || lower.includes('email')) {
      props[pname] = Object.assign({}, props[pname], { format: 'email' });
    }
    // boolean heuristics: name starts with is/has or common keywords and current type is integer
    for (const prefix of booleanPrefixes) {
      if (lower.startsWith(prefix) || lower === prefix) {
        const types = Array.isArray(pdef.type) ? pdef.type : [pdef.type];
        // Only convert if it's integer-like
        if (types.includes('integer') || types.includes('number') || (Array.isArray(pdef.type) && pdef.type.includes('integer'))) {
          props[pname] = Object.assign({}, props[pname], { type: 'boolean' });
        }
      }
    }
    // exact matches for common boolean fields
    const commonBoolean = ['enabled','isactive','active','status','deleted','deleted_at'];
    if (commonBoolean.includes(lower)) {
      props[pname] = Object.assign({}, props[pname], { type: 'boolean' });
    }
  }
  if (Object.keys(props).length) result.components[schemaName] = props;
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log('Wrote', outPath);
