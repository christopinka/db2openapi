Local and cloud mock options for the generated OpenAPI
====================================================

This folder contains quick-start artifacts to host a mock server from the generated OpenAPI file `openapi-mysql-fixed.json`.

Options included
- A — Local Docker mock using Stoplight Prism (very fast)
- B — Cloud Run deploy (containerized Prism)
- C — Postman / Stoplight studio instructions for creating a hosted mock
- D — Node-based mock scaffold using `openapi-backend` for custom handlers and stateful behavior

Prerequisite: you should have `openapi-mysql-fixed.json` in the repo root (produced by the mapping step).

Option A — Local Docker mock (recommended for quick sharing)

Run Prism using Docker (no install required):

```bash
# run Prism mock on port 4010
docker run --rm -p 4010:4010 \
  -v "$(pwd)/openapi-mysql-fixed.json:/tmp/openapi.json:ro" \
  stoplight/prism:4 mock -h 0.0.0.0 /tmp/openapi.json
```

Or use the provided docker-compose (makes it a one-liner):

```bash
cd mock
docker compose up --build
# stops with: docker compose down
```

The server will be available at http://localhost:4010

Option B — Cloud Run (GCP) / hosted container

Use the `prism.Dockerfile` (in this folder) to build an image and deploy to Cloud Run, AWS Fargate, or Azure Web App for Containers. Example for GCP Cloud Run:

```bash
# replace PROJECT_ID with your GCP project
docker build -t gcr.io/PROJECT_ID/fb-mock:latest -f mock/prism.Dockerfile .
docker push gcr.io/PROJECT_ID/fb-mock:latest
gcloud run deploy fb-mock --image gcr.io/PROJECT_ID/fb-mock --platform managed --region us-central1 --allow-unauthenticated
```

There is a GitHub Actions template (`.github/workflows/deploy-prism-cloudrun.yml`) in this repo that you can adapt to automate builds and deployment (requires a GCP service account and secrets).

Option C — Postman / Stoplight cloud mock

- Import `openapi-mysql-fixed.json` into Postman or Stoplight Studio.
- Create a mock server in Postman from the imported collection. Postman will give you a public URL to share.

Option D — Node mock scaffold (custom behavior)

This repo contains a small scaffold in `mock/node-mock/` demonstrating how to serve the OpenAPI using `openapi-backend` and Express. It allows adding custom handlers (stateful create/delete) and middleware (auth).

To run the node mock locally:

```bash
cd mock/node-mock
npm install
node index.js
# server runs on 4010 by default
```

Security notes
- Do not expose the mock publicly without sanitizing sensitive example data.
- Consider requiring an API key or restricting allowed origins.

Questions or want me to deploy one of these for you? Tell me which provider/account and I can wire up the automated deployment.
