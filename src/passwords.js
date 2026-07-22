// Hash de senha usando scrypt — nativo do módulo crypto do Node, evita
// dependências como bcrypt/argon2 que exigem compilação nativa e podem
// quebrar a instalação em máquinas sem toolchain de build.

const crypto = require("crypto");

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// Compara segredos em texto puro sem vazar timing. crypto.timingSafeEqual
// exige buffers do mesmo tamanho (lança erro se não forem), daí o check de
// comprimento antes — isso vaza o TAMANHO do segredo pelo tempo de
// resposta, mas não o conteúdo, que é o que importa.
function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { hashPassword, verifyPassword, timingSafeEqualString };
