const fs = require("fs");
const path = require("path");
const { createStore } = require("./db");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map(); // leilaoId -> { store, lastAccessedAt }

function storePath(leilaoId) {
  return path.join(DATA_DIR, `${leilaoId}.json`);
}

function getStore(leilaoId) {
  const entry = cache.get(leilaoId);
  if (entry) {
    entry.lastAccessedAt = Date.now();
    return entry.store;
  }
  const store = createStore(storePath(leilaoId));
  cache.set(leilaoId, { store, lastAccessedAt: Date.now() });
  return store;
}

// só pra src/stateBackup.js -- não força carregar do disco leilão nenhum
// que já não esteja em memória
function getCachedEntries() {
  return Array.from(cache.entries(), ([leilaoId, entry]) => [leilaoId, entry.store]);
}

// apagar o registro (registry.js) ANTES de chamar isso -- senão um
// getStore(id) no meio do caminho recria o arquivo do zero
function deleteStore(leilaoId) {
  cache.delete(leilaoId);
  try {
    fs.unlinkSync(storePath(leilaoId));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  if (process.env.DATABASE_URL) {
    // fire-and-forget: cópia de segurança é best-effort, nunca deve travar a exclusão
    require("./pg").query(`DELETE FROM leilao_state_backup WHERE leilao_id = $1`, [leilaoId]).catch((err) => {
      console.error(`[backup] falha ao apagar leilão "${leilaoId}" do backup:`, err.message);
    });
  }
}

const IDLE_EVICT_MS = 2 * 60 * 60 * 1000; // 2h
const EVICT_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15min

// só libera memória do processo -- o JSON no disco não é tocado, e um
// getStore() novo recarrega normalmente se alguém acessar de novo depois
function evictIdle(maxIdleMs = IDLE_EVICT_MS) {
  const now = Date.now();
  for (const [leilaoId, entry] of cache.entries()) {
    if (now - entry.lastAccessedAt < maxIdleMs) continue;
    const isOpen = entry.store.getState("open", "true") === "true";
    if (isOpen) continue; // nunca remove leilão aberto do cache, mesmo idle
    cache.delete(leilaoId);
  }
}

setInterval(() => evictIdle(), EVICT_CHECK_INTERVAL_MS);

module.exports = { getStore, getCachedEntries, deleteStore, evictIdle, storePath, DATA_DIR };
