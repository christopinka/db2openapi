MySQL devcontainer for testing DDL imports
=========================================

This devcontainer configuration brings up a MySQL 8.0 service and a helper `devcontainer` service you can use to run scripts and the project CLI against a real MySQL instance.

Quick steps

1. Open the repository in VS Code and reopen in container (Remote - Containers / Dev Containers). It will use `.devcontainer/devcontainer.json` and `docker-compose.yml`.
2. Wait for the container to start and the MySQL service to become healthy (healthcheck retries up to ~1 minute).
3. From inside the devcontainer shell, import your DDL file (for example `fb-dev.sql`) with the helper script:

```bash
chmod +x scripts/import_ddl_to_mysql.sh
./scripts/import_ddl_to_mysql.sh fb-dev.sql
```

4. Run the generator against the running MySQL instance (example):

```bash
npm run build
node dist/cli.js -t mysql -h mysql -p 3306 -u dev -P dev -d fb_dev -o openapi-mysql.json -e
```

Notes & tips

- The MySQL root user password is `root`. The dev user is `dev`/`dev` and the default database is `fb_dev`.
- If your DDL uses `CREATE DATABASE` or `USE` statements, modify the import script or pass a different DB name.
- For large DDL files consider increasing container memory or importing in the background using `mysql` client streaming.
