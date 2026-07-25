// Recupera o JSON de um leilão a partir da cópia de segurança no Postgres --
// só pra quando o arquivo local sumir/corromper (ex: falha do Volume). NÃO
// roda sozinho, é manual e fica fora do caminho quente da aplicação.
// Uso: node scripts/restore-leilao-from-backup.js <leilaoId>
require("dotenv").config();
const fs = require("fs");
const { query, getPool } = require("../src/pg");
const { storePath } = require("../src/stores");

async function main() {
  const leilaoId = process.argv[2];
  if (!leilaoId) {
    console.error("Uso: node scripts/restore-leilao-from-backup.js <leilaoId>");
    process.exit(1);
  }

  const filePath = storePath(leilaoId);
  if (fs.existsSync(filePath)) {
    console.error(`Já existe um arquivo em ${filePath} -- apague/renomeie antes de restaurar, pra não sobrescrever sem querer.`);
    process.exit(1);
  }

  const res = await query(`SELECT data, updated_at FROM leilao_state_backup WHERE leilao_id = $1`, [leilaoId]);
  if (res.rows.length === 0) {
    console.error(`Nenhuma cópia de segurança encontrada pro leilão "${leilaoId}".`);
    process.exit(1);
  }

  fs.writeFileSync(filePath, JSON.stringify(res.rows[0].data, null, 2), "utf-8");
  console.log(`Restaurado ${filePath} a partir do backup de ${res.rows[0].updated_at}.`);
  await getPool().end();
}

main().catch((err) => {
  console.error("Erro ao restaurar:", err.message);
  process.exit(1);
});
