# DigitalOcean Managed Database Migration Tool

A web app that generates a migration plan for moving a database into **DigitalOcean Managed
Databases**, using DigitalOcean Serverless Inference's text-to-text (chat completions)
endpoint. Pick a source engine, paste a schema or describe the data, pick the DO Managed
Database target engine, and optionally add cluster details — the app returns a migration
plan, example commands, cutover/validation steps, and a rollback note.

## DigitalOcean Managed Database facts baked into the prompt

- Supported target engines: **PostgreSQL, MySQL, MongoDB, Kafka, Valkey (Redis-compatible),
  OpenSearch**.
- Every cluster requires **TLS/SSL** for connections — there's no unencrypted option
  (`sslmode=require` for Postgres/MySQL-style clients).
- Default credentials pattern: user `doadmin`, database `defaultdb` (Postgres/MySQL) unless
  told otherwise.
- Clusters sit inside a VPC; the connecting host/app must be added to **Trusted Sources** in
  the cluster's firewall settings before it can connect.
- Automated daily backups + point-in-time recovery apply once data is in the cluster — that's
  not a substitute for a pre-cutover backup of the source.

Sources: [DigitalOcean Managed Databases docs](https://docs.digitalocean.com/products/databases/)

## What's inside

- `server.js` — Express server: `/api/migrate` builds a prompt from source engine + schema +
  target DO engine + cluster details and calls `POST /v1/chat/completions`; `/api/target-engines`
  serves the list of DO Managed Database engines
- `public/` — static frontend: source engine picker, schema textarea, DO target engine picker,
  optional cluster name/region/node size fields, and an output panel

## Run locally

```bash
cd do-managed-db-migration-tool
npm install
cp .env.example .env
# edit .env and set MODEL_ACCESS_KEY to your DO Serverless Inference key
npm start
```

Open http://localhost:8080.

## Environment variables

| Variable | Description |
|---|---|
| `MODEL_ACCESS_KEY` | Your DO Serverless Inference Model Access Key |
| `TEXT_MODEL` | Chat model slug, e.g. `llama3.3-70b-instruct` |
| `PORT` | Port to listen on (default `8080`) |

## Deploy to App Platform

1. Push this folder to a GitHub repo.
2. Update the `github.repo` field in `.do/app.yaml` to point at that repo.
3. Create the app, then set the real `MODEL_ACCESS_KEY` secret (don't commit it):
   ```bash
   doctl apps create --spec .do/app.yaml
   doctl apps update <app-id> --spec .do/app.yaml
   ```

**Note:** this is a planner/generator, not a migration runner — it doesn't connect to any
database, doesn't touch a real DO Managed Database cluster, and doesn't execute anything.
Always review generated commands before running them, and keep the source live until the
migration is validated.
