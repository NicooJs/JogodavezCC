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

function verifySignature({ signatureHeader, requestId, dataId, secret }) {
  if (!secret) return false;
  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  if (!ts || !v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return timingSafeEqualString(v1, expected);
}

module.exports = { verifySignature };
