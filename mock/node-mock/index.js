const OpenAPIBackend = require('openapi-backend').default || require('openapi-backend');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const api = new OpenAPIBackend({ definition: path.join(__dirname, '../../openapi-mysql-fixed.json') });

api.register({
  notFound: (c, req, res) => res.status(404).json({ error: 'Not found' }),
  validationFail: (c, req, res) => res.status(400).json({ error: 'Validation failed', details: c.validation.errors }),
  getUsers: (c, req, res) => {
    // example simple handler: return an empty list or sample
    res.json([]);
  }
});

api.init().then(() => {
  const app = express();
  app.use(bodyParser.json());
  app.use((req, res, next) => {
    // optional basic logging
    console.log(req.method, req.path);
    next();
  });
  app.use((req, res) => api.handleRequest(req, req, res));
  const port = process.env.PORT || 4010;
  app.listen(port, () => console.log('Node mock listening on', port));
});
