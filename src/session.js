// Cookie assinado à mão (HMAC-SHA256, só com o módulo nativo crypto). Não
// usa express-session: precisaria de um store, e nesse app baseado em
// arquivo JSON isso perderia todo login a cada redeploy. Não usa
// jsonwebtoken: nada aqui verifica token emitido por outro serviço.
//
// Escrita usa res.cookie()/res.clearCookie() (API do Express). Leitura é
// parser manual do header Cookie: sem o middleware cookie-parser não dá pra
// usar req.cookies, e require("cookie") é dependência TRANSITIVA do Express
// (só existe em node_modules por causa dele), não uma dependência nossa —
// podia sumir numa atualização do Express sem aviso.

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

// exp mora DENTRO do payload assinado, não só no Max-Age do cookie: Max-Age
// só é uma dica pro navegador se auto-limpar, nada impede reenviar
// manualmente um cookie antigo. Checar exp no payload à prova de adulteração
// garante expiração de verdade do lado do servidor.
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

// req.secure decide o flag "secure" do cookie — correto atrás do proxy do
// Railway graças a app.set("trust proxy", 1) em server.js. Fixar
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
