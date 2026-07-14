// Hash de senha usando scrypt — nativo do módulo crypto do Node, sem
// dependência nova (bcrypt/argon2 costumam exigir compilação nativa, o
// que quebraria a instalação no Windows do streamer, ver CLAUDE.md).

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

// Compara dois segredos "de texto puro" (não hash) sem vazar quanto tempo
// levou — usado onde a gente ainda não tem um hash pra comparar (segredo
// de super-admin, assinatura do webhook do pix.gg). crypto.timingSafeEqual
// exige os dois buffers do MESMO tamanho (lança erro se não forem) — por
// isso o check de comprimento antes; isso em si vaza o TAMANHO do segredo
// pelo tempo de resposta, mas não o CONTEÚDO, que é o que importa de
// verdade (o tamanho sozinho não ajuda a adivinhar o valor).
function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { hashPassword, verifyPassword, timingSafeEqualString };
