// Verificação da assinatura do webhook do Mercado Pago -- espelha o papel
// de src/pixggClient.js (verifySignature) pro esquema deles, que é
// diferente: não é um segredo simples na URL, é HMAC-SHA256 sobre um
// "manifest" de campos específicos, mandado no header x-signature.
//
// IMPORTANTE: o formato exato do manifest não pôde ser confirmado direto
// contra a documentação nessa sessão (o site do MP não cooperou com busca
// automatizada, mesmo depois de várias tentativas) -- o formato abaixo é
// o documentado/usado pelos SDKs oficiais deles, com a confiança mais alta
// que consegui sem acesso a um webhook de verdade. Se o primeiro webhook
// real chegar e a assinatura não bater, o log (ver server.js, mesmo
// prefixo "[webhook mercadopago]" já usado pro pix.gg) mostra os valores
// crus recebidos -- ajusta esse arquivo com base no que chegar de
// verdade, não precisa adivinhar de novo.
const { timingSafeEqualString } = require("./passwords");
const crypto = require("crypto");

// x-signature vem como "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2..."
function parseSignatureHeader(header) {
  const parts = {};
  for (const piece of String(header || "").split(",")) {
    const [key, value] = piece.split("=");
    if (key && value) parts[key.trim()] = value.trim();
  }
  return parts;
}

// dataId vem do query string da notificação (?data.id=...&type=payment),
// requestId do header x-request-id -- nenhum dos dois vem do corpo do
// POST, que é minimalista de propósito (só avisa "algo mudou", nunca
// confiar nele pro dado real, ver mpApi.getPayment).
function verifySignature({ signatureHeader, requestId, dataId, secret }) {
  if (!secret) return false;
  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  if (!ts || !v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return timingSafeEqualString(v1, expected);
}

module.exports = { verifySignature };
