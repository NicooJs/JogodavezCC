// Criptografia dos tokens OAuth do Mercado Pago guardados no Postgres --
// são credenciais reais que deixam o app agir em nome da conta MP do
// streamer, então nunca ficam em texto puro em disco. AES-256-GCM via
// crypto nativo do Node (mesma disciplina de src/passwords.js/session.js:
// sem dependência nova só pra isso).
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, tamanho recomendado de IV pro modo GCM

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error("TOKEN_ENCRYPTION_KEY não configurado");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY precisa ter exatamente 32 bytes (64 caracteres hex)");
  }
  return key;
}

// Formato guardado: "iv:tag:dados", tudo hex -- o tag de autenticação do
// GCM (getAuthTag) precisa ser guardado junto, sem ele não dá pra decifrar
// nem detectar se o texto cifrado foi adulterado.
function encryptToken(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptToken(stored) {
  const parts = String(stored).split(":");
  if (parts.length !== 3) throw new Error("Formato inválido de token cifrado");
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf-8");
}

module.exports = { encryptToken, decryptToken };
