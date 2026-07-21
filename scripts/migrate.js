// Aplica as migrations SQL em src/migrations/, em ordem, contra DATABASE_URL.
// Sem ORM/framework de migration -- é só uma pasta de .sql numerados,
// idempotentes (CREATE TABLE IF NOT EXISTS), rodados na ordem certa.
//
// Uso: node scripts/migrate.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { query, getPool } = require("../src/pg");

async function main() {
  const dir = path.join(__dirname, "..", "src", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.log("Nenhuma migration encontrada em", dir);
    return;
  }
  for (const file of files) {
    console.log(`Aplicando ${file}...`);
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    await query(sql);
  }
  console.log("Migrations aplicadas com sucesso.");
  await getPool().end();
}

main().catch((err) => {
  console.error("Erro ao aplicar migrations:", err.message);
  process.exit(1);
});
