// Cópia de segurança do registro de leilões (src/registry.js) pro Postgres --
// rede de segurança independente do Volume, NÃO é a fonte de verdade (isso
// continua sendo o data/_registry.json, ver registry.js). Diferente do
// backup de estado (src/stateBackup.js, que faz snapshot a cada 20s pra
// coalescer rajada de doação), o registro muda raramente -- cada função
// aqui é chamada direto no momento da mutação (criar/apagar/desvincular),
// sem tick periódico.
const { query } = require("./pg");

let warnedNoDatabaseUrl = false;

function hasDatabaseUrl() {
  if (process.env.DATABASE_URL) return true;
  if (!warnedNoDatabaseUrl) {
    console.log("[registryBackup] DATABASE_URL não configurado -- backup do registro desativado");
    warnedNoDatabaseUrl = true;
  }
  return false;
}

async function backupLeilaoMeta(leilaoId, meta) {
  if (!hasDatabaseUrl()) return;
  try {
    await query(
      `INSERT INTO registry_backup (leilao_id, meta, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (leilao_id) DO UPDATE SET meta = $2::jsonb, updated_at = now()`,
      [leilaoId, JSON.stringify(meta)]
    );
  } catch (err) {
    console.error(`[registryBackup] falha ao gravar leilão "${leilaoId}":`, err.message);
  }
}

async function deleteLeilaoBackup(leilaoId) {
  if (!hasDatabaseUrl()) return;
  try {
    await query(`DELETE FROM registry_backup WHERE leilao_id = $1`, [leilaoId]);
  } catch (err) {
    console.error(`[registryBackup] falha ao apagar leilão "${leilaoId}" do backup:`, err.message);
  }
}

// backfill único na subida do processo -- cobre leilões que já existiam
// antes dessa feature (nunca dispararam create/delete/unlink desde então)
async function backupAll() {
  if (!hasDatabaseUrl()) return;
  const registry = require("./registry");
  for (const leilaoId of registry.listLeilaoIds()) {
    const meta = registry.getLeilaoMeta(leilaoId);
    if (meta) await backupLeilaoMeta(leilaoId, meta);
  }
}

module.exports = { backupLeilaoMeta, deleteLeilaoBackup, backupAll };
