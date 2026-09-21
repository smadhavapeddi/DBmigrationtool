// DigitalOcean Managed Database Migration Tool — generates a migration plan,
// commands, and rollback/validation steps for moving a database into
// DigitalOcean Managed Databases, using DO Serverless Inference's
// text-to-text (chat completions) endpoint.
//
// This tool does NOT connect to any real database or execute anything — it
// only generates a plan/script for the user to review and run themselves.

import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const MODEL_ACCESS_KEY = process.env.MODEL_ACCESS_KEY;
const TEXT_MODEL = process.env.TEXT_MODEL || "llama3.3-70b-instruct";
const PORT = process.env.PORT || 8080;
const BASE_URL = "https://inference.do-ai.run/v1";

if (!MODEL_ACCESS_KEY) {
  console.error(
    "Missing MODEL_ACCESS_KEY. Copy .env.example to .env and add your key.\n" +
      "Docs: https://docs.digitalocean.com/products/inference/how-to/manage-model-access-keys/"
  );
  process.exit(1);
}

const client = new OpenAI({ baseURL: BASE_URL, apiKey: MODEL_ACCESS_KEY });

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/config", (_req, res) => {
  res.json({ baseUrl: BASE_URL, textModel: TEXT_MODEL });
});

// Engines DigitalOcean Managed Databases actually supports today.
const TARGET_ENGINES = ["PostgreSQL", "MySQL", "MongoDB", "Kafka", "Valkey (Redis-compatible)", "OpenSearch"];

app.get("/api/target-engines", (_req, res) => res.json({ engines: TARGET_ENGINES }));

const SYSTEM_PROMPT = `You are a senior database engineer specializing in migrating databases INTO
DigitalOcean Managed Databases. You know these DigitalOcean-specific facts and must apply them:

- Supported target engines: PostgreSQL, MySQL, MongoDB, Kafka, Valkey (Redis-compatible), OpenSearch.
- Every cluster requires TLS/SSL for connections (sslmode=require for Postgres/MySQL-style clients);
  there is no unencrypted connection option.
- Default credentials pattern: user "doadmin", default database "defaultdb" (Postgres/MySQL), unless
  the user says otherwise.
- Clusters are deployed inside a VPC; the "Trusted Sources" firewall setting must allow the
  migrating host/app before it can connect.
- Automated daily backups with point-in-time recovery exist once data lands, but that does not
  replace a pre-cutover backup of the source.

Given a source engine, source schema/data description, target DO Managed Database engine, and
optional cluster details (name, region, node size), produce exactly these sections:

1. "## Migration Plan" — a short numbered plan (4-8 steps) covering pre-checks, schema migration,
   data load approach (dump/restore, CDC, or engine-native tool), cutover, and validation.
2. "## Commands" — one fenced code block (bash) with concrete example commands using the right
   native tool for the engines involved (pg_dump/pg_restore + psql, mysqldump/mysql, mongodump/
   mongorestore, kafka MirrorMaker/console tools, redis-cli/valkey-cli, etc.), including
   sslmode=require or --ssl flags and doadmin/defaultdb placeholders where relevant.
3. "## Cutover & Validation" — 2-4 sentences on how to confirm the migration succeeded (row counts,
   checksums, smoke queries) and how to cut traffic over with minimal downtime.
4. "## Rollback" — how to revert if something goes wrong (keep source live until validated, snapshot
   before destructive steps, etc.).

Be concise and concrete. Do not add commentary outside those four sections.`;

app.post("/api/migrate", async (req, res) => {
  const sourceEngine = (req.body?.sourceEngine || "").trim();
  const schema = (req.body?.schema || "").trim();
  const targetEngine = (req.body?.targetEngine || "").trim();
  const clusterName = (req.body?.clusterName || "").trim();
  const region = (req.body?.region || "").trim();
  const nodeSize = (req.body?.nodeSize || "").trim();

  if (!schema) return res.status(400).json({ error: "schema/data description is required" });
  if (!sourceEngine || !targetEngine) {
    return res.status(400).json({ error: "sourceEngine and targetEngine are required" });
  }

  const clusterDetails = [
    clusterName ? `Cluster name: ${clusterName}` : null,
    region ? `Region: ${region}` : null,
    nodeSize ? `Node size: ${nodeSize}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = [
    `Source engine: ${sourceEngine}`,
    `Target: DigitalOcean Managed Database — ${targetEngine}`,
    clusterDetails || `Cluster details: not specified — use placeholder values.`,
    ``,
    `Source schema / data description:`,
    "```",
    schema,
    "```",
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 1000,
      temperature: 0.3,
    });
    res.json({
      text: completion.choices[0].message.content,
      model: completion.model,
      usage: completion.usage,
      endpoint: `${BASE_URL}/chat/completions`,
    });
  } catch (err) {
    console.error("migrate error:", err.message || err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`DO Managed Database Migration Tool listening on :${PORT}`);
  console.log(`Text model: ${TEXT_MODEL} | Base: ${BASE_URL}`);
});
