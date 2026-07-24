// Guarda em memória o áudio TTS já gerado, só pelo tempo curto que o
// overlay leva pra buscar depois do alerta chegar via socket -- nunca em
// disco/Postgres, é conteúdo pontual, não histórico (mesma decisão de não
// virar "banco" de nada que não seja crédito/auditoria de pagamento).
const TTL_MS = 5 * 60 * 1000;
const store = new Map(); // paymentId (string) -> { buffer, expiresAt }

function put(paymentId, buffer) {
  store.set(String(paymentId), { buffer, expiresAt: Date.now() + TTL_MS });
}

function get(paymentId) {
  const entry = store.get(String(paymentId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(String(paymentId));
    return null;
  }
  return entry.buffer;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 60_000).unref();

module.exports = { put, get };
