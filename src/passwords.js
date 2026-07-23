// Hash de senha usando scrypt — nativo do módulo crypto do Node, evita
// dependências como bcrypt/argon2 que exigem compilação nativa e podem
// quebrar a instalação em máquinas sem toolchain de build.
//
// Versão ASYNC de propósito (crypto.scrypt, não scryptSync): scryptSync
// trava a thread principal do Node inteira enquanto calcula -- como o
// processo é único pra todos os leilões, um IP mandando várias tentativas
// de senha em sequência conseguia travar o site inteiro por alguns
// segundos, não só a verificação daquele leilão. A versão async roda o
// cálculo na threadpool do libuv, então o resto do servidor (outros
// leilões, socket.io) continua respondendo normalmente nesse meio tempo.

const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(String(password), salt, KEY_LENGTH)).toString("hex");
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  try {
    const candidate = await scrypt(String(password), salt, KEY_LENGTH);
    const expected = Buffer.from(hash, "hex");
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
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
