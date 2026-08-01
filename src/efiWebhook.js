const { timingSafeEqualString } = require("./passwords");

// Efí não assina o webhook com HMAC (diferente do Mercado Pago); a
// autenticidade deles é via mTLS na camada de conexão, que não dá pra
// verificar aqui porque o Railway termina o TLS antes de chegar no Node.
//
// A doc da Efí sugere também travar por IP fixo, mas na prática o IP
// documentado (34.193.116.226) não bateu com o IP real observado na
// validação do webhook (152.233.47.x) -- provavelmente um pool/range não
// documentado direito. Por isso o IP aqui é só log/alerta (defesa em
// profundidade), NÃO bloqueia sozinho: o segredo de 24 bytes na URL já é
// a barreira de verdade (imprevisível o suficiente por si só).
const KNOWN_IPS = ["34.193.116.226", "152.233.47.66", "152.233.47.69"];

function getKnownIps() {
  const fromEnv = (process.env.EFI_WEBHOOK_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : KNOWN_IPS;
}

// req.ip já reflete o IP real do cliente (server.js configura "trust proxy")
function isKnownIp(remoteIp) {
  return getKnownIps().includes(String(remoteIp || "").replace(/^::ffff:/, ""));
}

function verifyToken(pathToken, secret) {
  if (!secret || !pathToken) return false;
  return timingSafeEqualString(pathToken, secret);
}

// o segredo na URL é quem decide autenticidade; IP fora da lista conhecida
// não bloqueia, só fica visível pra quem for olhar os logs
function isAuthentic({ pathToken, secret }) {
  return verifyToken(pathToken, secret);
}

module.exports = { isKnownIp, verifyToken, isAuthentic, getKnownIps };
