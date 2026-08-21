// Recupera o registro de leilões (data/_registry.json) a partir da cópia de
// segurança no Postgres -- só pra quando o arquivo local sumir/corromper
// (ex: falha do Volume). NÃO roda sozinho, é manual e fica fora do caminho
// quente da aplicação. Diferente do restore de estado (que é por leilão),
// esse reconstrói o arquivo INTEIRO de uma vez, já que o registro é
// compartilhado entre todos os leilões.
// Uso: node scripts/restore-registry-from-backup.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { query, getPool } = require("../src/pg");

// não importa src/stores.js aqui de propósito -- esse módulo liga um
// setInterval de limpeza de cache como efeito colateral do require, o que
// impediria esse script (de vida curta) de sair sozinho no final
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

async function main() {
  const filePath = path.join(DATA_DIR, "_registry.json");
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (raw.trim() && raw.trim() !== "{}") {
      console.error(`Já existe um arquivo não vazio em ${filePath} -- apague/renomeie antes de restaurar, pra não sobrescrever sem querer.`);
      process.exit(1);
    }
  }

  const res = await query(`SELECT leilao_id, meta, updated_at FROM registry_backup ORDER BY leilao_id`);
  if (res.rows.length === 0) {
    console.error("Nenhuma cópia de segurança encontrada no Postgres.");
    process.exit(1);
  }

  const registry = { leiloes: {} };
  for (const row of res.rows) {
    registry.leiloes[row.leilao_id] = row.meta;
  }

  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2), "utf-8");
  const mostRecente = res.rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), res.rows[0].updated_at);
  console.log(`Restaurado ${filePath} com ${res.rows.length} leilão(ões) a partir do backup (mais recente: ${mostRecente}).`);
  await getPool().end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro ao restaurar:", err.message);
  process.exit(1);
});
