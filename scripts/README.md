OpenAPI analysis helper
======================

`scripts/analyze_openapi_issues.js` scans a generated OpenAPI file (default: `openapi-mysql.json`) and reports likely problematic mappings such as integer fields that look like booleans, emails/uuids missing `format`, and string fields with numeric examples.

Usage:

```bash
node scripts/analyze_openapi_issues.js openapi-mysql.json
```
