// Verificação da assinatura do webhook do Mercado Pago: HMAC-SHA256 sobre
// um "manifest" de campos específicos, mandado no header x-signature (não
// é um segredo simples na URL).
//
// Formato do manifest segue a documentação/SDKs oficiais do MP. Se a
// assinatura de um webhook real não bater, o log "[webhook mercadopago]"
// em server.js mostra os valores crus recebidos pra ajustar aqui.
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

// dataId vem do query string (?data.id=...&type=payment), requestId do
// header x-request-id — nenhum dos dois vem do corpo do POST, que só avisa
// "algo mudou" e nunca deve ser usado como dado real (ver mpApi.getPayment).
function verifySignature({ signatureHeader, requestId, dataId, secret }) {
  if (!secret) return false;
  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  if (!ts || !v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return timingSafeEqualString(v1, expected);
}

module.exports = { verifySignature };
