#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const openapiPath = process.argv[2] || path.join(process.cwd(), 'openapi-mysql-fixed.json');
const outPath = process.argv[3] || path.join(process.cwd(), 'mock', 'postman_collection.json');

if (!fs.existsSync(openapiPath)) { console.error('OpenAPI file not found:', openapiPath); process.exit(2); }
const openapi = JSON.parse(fs.readFileSync(openapiPath));

const collection = {
  info: {
    name: 'db2openapi - Mock API (full)',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Postman collection generated from openapi-mysql-fixed.json. Update the base_url variable to point at your mock server (default: http://localhost:4010).'
  },
  item: [],
  variable: [
    { key: 'base_url', value: 'http://localhost:4010', type: 'string' }
  ]
};

function pathToSegments(rawPath) {
  // split into segments, keep {param} as :param
  return rawPath.split('/').filter(Boolean).map(seg => {
    if (seg.startsWith('{') && seg.endsWith('}')) return ':' + seg.slice(1,-1);
    return seg;
  });
}

for (const [pathKey, methods] of Object.entries(openapi.paths || {})) {
  const folder = { name: pathKey, item: [] };
  for (const [method, op] of Object.entries(methods)) {
    const name = `${method.toUpperCase()} ${pathKey}`;
    const raw = '{{base_url}}' + pathKey.replace(/{/g, ':').replace(/}/g, '');
    const url = {
      raw,
      host: ['{{base_url}}'],
      path: pathToSegments(pathKey)
    };
    const request = {
      method: method.toUpperCase(),
      header: [ { key: 'Accept', value: 'application/json' } ],
      url
    };
    // if requestBody with example or schema example, try to attach a JSON body
    if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
      const content = op.requestBody.content['application/json'];
      let example = null;
      if (content.example) example = content.example;
      if (content.examples) {
        const exKey = Object.keys(content.examples)[0];
        if (exKey && content.examples[exKey] && content.examples[exKey].value) example = content.examples[exKey].value;
      }
      // fallback to schema example
      if (!example && content.schema && content.schema.$ref) {
        const ref = content.schema.$ref.replace('#/components/schemas/','');
        const comp = openapi.components && openapi.components.schemas && openapi.components.schemas[ref];
        if (comp && comp.example) example = comp.example;
      }
      if (example) {
        request.body = { mode: 'raw', raw: JSON.stringify(example, null, 2), options: { raw: { language: 'json' } } };
        request.header.push({ key: 'Content-Type', value: 'application/json' });
      }
    }
    const item = { name, request, response: [] };
    folder.item.push(item);
  }
  collection.item.push(folder);
}

fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));
console.log('Wrote', outPath);
