// Cópia de segurança periódica do estado de cada leilão pro Postgres --
// rede de segurança independente do Volume, NÃO é a fonte de verdade (isso
// continua sendo o JSON no disco, ver src/db.js/src/stores.js). Snapshot em
// vez de gravar a cada mutação: coalesce rajada de doação num UPSERT só por
// leilão e evita corrida entre escritas concorrentes fora de ordem.
const { query } = require("./pg");
const { getCachedEntries } = require("./stores");

const BACKUP_INTERVAL_MS = 20_000;

let warnedNoDatabaseUrl = false;

async function backupTick() {
  if (!process.env.DATABASE_URL) {
    if (!warnedNoDatabaseUrl) {
      console.log("[backup] DATABASE_URL não configurado -- backup do estado do leilão desativado");
      warnedNoDatabaseUrl = true;
    }
    return;
  }

  for (const [leilaoId, store] of getCachedEntries()) {
    try {
      const snapshot = store.getRawSnapshot();
      await query(
        `INSERT INTO leilao_state_backup (leilao_id, data, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (leilao_id) DO UPDATE SET data = $2::jsonb, updated_at = now()`,
        [leilaoId, JSON.stringify(snapshot)]
      );
    } catch (err) {
      console.error(`[backup] falha ao gravar leilão "${leilaoId}":`, err.message);
    }
  }
}

function start() {
  setInterval(() => {
    backupTick().catch((err) => console.error("[backup] erro inesperado no tick:", err.message));
  }, BACKUP_INTERVAL_MS);
}

module.exports = { start };
