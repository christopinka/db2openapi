#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const openapiPath = process.argv[2] || path.join(process.cwd(), 'openapi-mysql-fixed.json');
const mappingsPath = process.argv[3] || path.join(process.cwd(), 'mappings.json');

if (!fs.existsSync(openapiPath)) { console.error('OpenAPI file not found:', openapiPath); process.exit(2); }
const openapi = JSON.parse(fs.readFileSync(openapiPath));
const mappings = fs.existsSync(mappingsPath) ? JSON.parse(fs.readFileSync(mappingsPath)) : {};
const comps = openapi.components && openapi.components.schemas ? openapi.components.schemas : {};

function sampleFor(propName, def, map) {
  if (map && map.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
  if (map && map.format === 'email') return 'user@example.com';
  if (map && map.type === 'boolean') return false;
  // infer from name
  const lname = propName.toLowerCase();
  if (lname.includes('email')) return 'user@example.com';
  if (lname.includes('uuid') || lname.endsWith('_id') && def && def.type === 'string') return '00000000-0000-0000-0000-000000000000';
  if (lname.startsWith('is') || lname.startsWith('has') || lname.startsWith('should') || ['enabled','active','status','deleted_at'].includes(lname)) return false;
  // based on type
  const t = def && def.type;
  if (t === 'boolean') return false;
  if (t === 'integer' || t === 'number') return 0;
  if (t === 'string') {
    if (def && def.format === 'date-time') return new Date().toISOString();
    return 'Lorem ipsum dolor sit amet';
  }
  return null;
}

let updated = 0;
for (const [schemaName, schema] of Object.entries(comps)) {
  if (!schema.properties) continue;
  const mapProps = (mappings.components && mappings.components[schemaName]) || {};
  // fix schema.example
  if (schema.example) {
    const ex = Object.assign({}, schema.example);
    let changed = false;
    for (const [pname, pdef] of Object.entries(schema.properties)) {
      const map = mapProps[pname];
      const val = sampleFor(pname, pdef, map);
      if (val !== null && typeof ex[pname] !== typeof val) {
        ex[pname] = val;
        changed = true;
      }
      // also if format mismatches for strings, replace with sample
      if (map && map.format && typeof ex[pname] === 'string') {
        if (map.format === 'uuid' && !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(ex[pname])) {
          ex[pname] = sampleFor(pname, pdef, map);
          changed = true;
        }
        if (map.format === 'email' && !/^\S+@\S+\.\S+$/.test(ex[pname])) {
          ex[pname] = sampleFor(pname, pdef, map);
          changed = true;
        }
      }
    }
    if (changed) {
      schema.example = ex;
      updated++;
    }
  }
  // fix examples inside properties if present (rare)
  // fix examples inside paths/responses later
}
// Also traverse paths -> responses -> examples -> value and adjust properties
if (openapi.paths) {
  for (const [p, methods] of Object.entries(openapi.paths)) {
    for (const [m, op] of Object.entries(methods)) {
      if (!op.responses) continue;
      for (const [status, resp] of Object.entries(op.responses)) {
        if (!resp.content) continue;
        for (const [ctype, cinfo] of Object.entries(resp.content)) {
          if (!cinfo.examples) continue;
          for (const [exName, exDef] of Object.entries(cinfo.examples)) {
            if (!exDef || !exDef.value) continue;
            const val = exDef.value;
            // if array, fix first item's props
            if (Array.isArray(val)) {
              const item = val[0];
              if (item && typeof item === 'object') {
                let changed=false;
                for (const [schemaName, schema] of Object.entries(comps)) {
                  // try to match by keys: if item has all required keys of schema, assume it's that schema
                  const keys = Object.keys(schema.properties || {});
                  const required = schema.required || [];
                  const hasAll = required.every(r=>Object.prototype.hasOwnProperty.call(item,r));
                  if (!hasAll) continue;
                  const mapProps = (mappings.components && mappings.components[schemaName]) || {};
                  for (const [pname, pdef] of Object.entries(schema.properties)) {
                    if (!Object.prototype.hasOwnProperty.call(item,pname)) continue;
                    const map = mapProps[pname];
                    const sample = sampleFor(pname,pdef,map);
                    if (sample !== null) {
                      // replace if type mismatch or format mismatch
                      if (typeof item[pname] !== typeof sample) { item[pname] = sample; changed=true; }
                      if (map && map.format && typeof item[pname] === 'string') {
                        if (map.format === 'uuid' && !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(item[pname])) { item[pname]=sample; changed=true; }
                        if (map.format === 'email' && !/^\S+@\S+\.\S+$/.test(item[pname])) { item[pname]=sample; changed=true; }
                      }
                    }
                  }
                  if (changed) break;
                }
                if (changed) { exDef.value[0]=item; updated++; }
              }
            } else if (val && typeof val === 'object') {
              const item = val;
              let changed=false;
              for (const [schemaName, schema] of Object.entries(comps)) {
                const required = schema.required || [];
                const hasAll = required.every(r=>Object.prototype.hasOwnProperty.call(item,r));
                if (!hasAll) continue;
                const mapProps = (mappings.components && mappings.components[schemaName]) || {};
                for (const [pname, pdef] of Object.entries(schema.properties)) {
                  if (!Object.prototype.hasOwnProperty.call(item,pname)) continue;
                  const map = mapProps[pname];
                  const sample = sampleFor(pname,pdef,map);
                  if (sample !== null) {
                    if (typeof item[pname] !== typeof sample) { item[pname]=sample; changed=true; }
                    if (map && map.format && typeof item[pname] === 'string') {
                      if (map.format === 'uuid' && !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(item[pname])) { item[pname]=sample; changed=true; }
                      if (map.format === 'email' && !/^\S+@\S+\.\S+$/.test(item[pname])) { item[pname]=sample; changed=true; }
                    }
                  }
                }
                if (changed) break;
              }
              if (changed) { exDef.value = item; updated++; }
            }
          }
        }
      }
    }
  }
}

if (updated) {
  fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));
}
console.log('Updated examples for', updated, 'items');
