const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

function parseKey(hex) {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("Chave de cifra precisa ter exatamente 32 bytes (64 caracteres hex)");
  }
  return key;
}

function getCurrentKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error("TOKEN_ENCRYPTION_KEY não configurado");
  return parseKey(hex);
}

// TOKEN_ENCRYPTION_KEY_OLD (opcional, separado por vírgula): chaves antigas
// só usadas pra decifrar durante uma rotação -- nunca pra cifrar de novo
function getDecryptionKeys() {
  const keys = [getCurrentKey()];
  const oldHex = process.env.TOKEN_ENCRYPTION_KEY_OLD;
  if (oldHex) {
    for (const part of oldHex.split(",")) {
      const trimmed = part.trim();
      if (trimmed) keys.push(parseKey(trimmed));
    }
  }
  return keys;
}

// formato: "iv:tag:dados" em hex -- sem o auth tag do GCM não dá pra decifrar
function encryptToken(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getCurrentKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptToken(stored) {
  const parts = String(stored).split(":");
  if (parts.length !== 3) throw new Error("Formato inválido de token cifrado");
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");

  let lastErr;
  for (const key of getDecryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

module.exports = { encryptToken, decryptToken };
