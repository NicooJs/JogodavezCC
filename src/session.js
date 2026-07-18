// Cookie assinado à mão (HMAC-SHA256, só com o módulo nativo crypto) — sem
// express-session (precisaria de um store; nesse app baseado em arquivo JSON
// isso significaria perder todo login a cada redeploy) nem jsonwebtoken
// (resolve um problema que não existe aqui — nada verifica token emitido por
// outro serviço). Mesma filosofia de "sem dependência que exige compilar
// nativo" que já levou o hash de senha pra scrypt em vez de bcrypt/argon2
// (ver src/passwords.js).
//
// Escrita usa res.cookie()/res.clearCookie() (API pública do próprio
// Express). Leitura é parser manual do header Cookie -- não dá pra usar
// req.cookies sem o middleware cookie-parser, e não dá pra importar
// require("cookie") direto porque isso é dependência TRANSITIVA do Express
// (só existe em node_modules porque o Express usa por baixo), não uma
// dependência nossa declarada -- podia sumir numa atualização do Express
// sem aviso nenhum.

const crypto = require("crypto");
const { timingSafeEqualString } = require("./passwords");

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  return secret;
}

function signValue(payload, maxAgeSeconds) {
  const withExp = { ...payload, exp: Date.now() + maxAgeSeconds * 1000 };
  const payloadB64 = Buffer.from(JSON.stringify(withExp)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

// exp mora DENTRO do payload assinado, não só no Max-Age do cookie -- Max-Age
// é só uma dica pro navegador se auto-limpar; nada impede alguém de reenviar
// manualmente (devtools, curl) um valor de cookie antigo depois disso. Checar
// exp dentro do payload à prova de adulteração é o que garante expiração de
// verdade, do lado do servidor.
function verifyValue(cookieValue) {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const lastDot = cookieValue.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payloadB64 = cookieValue.slice(0, lastDot);
  const sig = cookieValue.slice(lastDot + 1);

  let expectedSig;
  try {
    expectedSig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  } catch {
    return null;
  }
  if (!timingSafeEqualString(sig, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || Date.now() > payload.exp) return null;

  return payload;
}

// req.secure (não uma variável tipo NODE_ENV, que não existe em lugar nenhum
// desse projeto hoje) decide o flag "secure" do cookie -- consistente com o
// app.set("trust proxy", 1) já corrigido nesta mesma sessão de trabalho (ver
// commit sobre a URL de webhook em http:// vs https://) pro Railway. Fixar
// secure:true quebraria login local em http://localhost em silêncio.
const COOKIE_BASE_OPTIONS = { httpOnly: true, path: "/", sameSite: "lax" };

function setCookie(req, res, name, payload, maxAgeSeconds) {
  res.cookie(name, signValue(payload, maxAgeSeconds), {
    ...COOKIE_BASE_OPTIONS,
    secure: req.secure,
    maxAge: maxAgeSeconds * 1000, // Express usa milissegundos; nossa assinatura usa segundos
  });
}

function parseCookieHeader(header) {
  const result = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function getCookie(req, name) {
  const cookies = parseCookieHeader(req.headers.cookie);
  return verifyValue(cookies[name]);
}

function clearCookie(req, res, name) {
  res.clearCookie(name, { ...COOKIE_BASE_OPTIONS, secure: req.secure });
}

module.exports = { setCookie, getCookie, clearCookie };
