// Aplica as migrations SQL em src/migrations/, em ordem, contra DATABASE_URL.
// Sem ORM/framework de migration -- é só uma pasta de .sql numerados,
// idempotentes (CREATE TABLE IF NOT EXISTS), rodados na ordem certa.
// schema_migrations controla quais já rodaram, pra não reaplicar à toa.
//
// Uso: node scripts/migrate.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getPool } = require("../src/pg");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query(`SELECT filename FROM schema_migrations`);
  return new Set(res.rows.map((r) => r.filename));
}

async function main() {
  const dir = path.join(__dirname, "..", "src", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.log("Nenhuma migration encontrada em", dir);
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Pulando ${file} (já aplicada)`);
        continue;
      }
      console.log(`Aplicando ${file}...`);
      const sql = fs.readFileSync(path.join(dir, file), "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("Migrations aplicadas com sucesso.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Erro ao aplicar migrations:", err.message);
  process.exit(1);
});
