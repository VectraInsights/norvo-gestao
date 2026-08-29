// Aplica uma migration SQL no Supabase via pooler.
// Uso: $env:DATABASE_URL = "postgresql://..."; node scripts/apply-migration.cjs <arquivo.sql>
// A connection string NUNCA vai versionada (contém senha).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const FILE = process.argv[2];
if (!FILE || !process.env.DATABASE_URL) {
  console.error("uso: DATABASE_URL=<string> node scripts/apply-migration.cjs <arquivo.sql>");
  process.exit(1);
}

(async () => {
  const sql = fs.readFileSync(path.resolve(FILE), "utf8");
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(sql);
    await c.query("COMMIT");
    console.log("MIGRATION OK:", FILE);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
