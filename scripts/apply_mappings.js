#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const openapiPath = process.argv[2] || path.join(process.cwd(), 'openapi-mysql.json');
const mappingsPath = process.argv[3] || path.join(process.cwd(), 'mappings.json');
const outPath = process.argv[4] || path.join(process.cwd(), 'openapi-mysql-fixed.json');

if (!fs.existsSync(openapiPath)) { console.error('OpenAPI file not found:', openapiPath); process.exit(2); }
if (!fs.existsSync(mappingsPath)) { console.error('Mappings file not found:', mappingsPath); process.exit(2); }

const openapi = JSON.parse(fs.readFileSync(openapiPath));
const mappings = JSON.parse(fs.readFileSync(mappingsPath));

const comps = openapi.components && openapi.components.schemas ? openapi.components.schemas : {};
const mapComps = mappings.components || {};

for (const [compName, props] of Object.entries(mapComps)) {
  const comp = comps[compName];
  if (!comp || !comp.properties) continue;
  for (const [propName, mapDef] of Object.entries(props)) {
    if (!comp.properties[propName]) continue;
    // Apply type change
    if (mapDef.type) {
      comp.properties[propName].type = mapDef.type;
      // remove format if not string
      if (mapDef.type !== 'string' && comp.properties[propName].format) delete comp.properties[propName].format;
    }
    if (mapDef.format) {
      comp.properties[propName].format = mapDef.format;
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(openapi, null, 2));
console.log('Wrote', outPath);
