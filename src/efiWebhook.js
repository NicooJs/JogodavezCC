const { timingSafeEqualString } = require("./passwords");

// Efí não assina o webhook com HMAC (diferente do Mercado Pago); a
// autenticidade deles é via mTLS na camada de conexão, que não dá pra
// verificar aqui porque o Railway termina o TLS antes de chegar no Node.
// A própria Efí recomenda IP fixo + segredo na URL como alternativa —
// duas camadas, nenhuma delas sozinha é tão forte quanto mTLS de verdade.
const DEFAULT_IPS = ["34.193.116.226"];

function getAllowedIps() {
  const fromEnv = (process.env.EFI_WEBHOOK_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_IPS;
}

// req.ip já reflete o IP real do cliente (server.js configura "trust proxy")
function verifyIp(remoteIp) {
  return getAllowedIps().includes(String(remoteIp || "").replace(/^::ffff:/, ""));
}

function verifyToken(pathToken, secret) {
  if (!secret || !pathToken) return false;
  return timingSafeEqualString(pathToken, secret);
}

function isAuthentic({ remoteIp, pathToken, secret }) {
  return verifyIp(remoteIp) && verifyToken(pathToken, secret);
}

module.exports = { verifyIp, verifyToken, isAuthentic, getAllowedIps };
