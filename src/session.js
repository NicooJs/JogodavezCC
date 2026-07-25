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

// exp fica dentro do payload assinado -- Max-Age do cookie é só uma dica pro
// navegador, não impede reenviar um cookie antigo manualmente
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

const COOKIE_BASE_OPTIONS = { httpOnly: true, path: "/", sameSite: "lax" };

function setCookie(req, res, name, payload, maxAgeSeconds) {
  res.cookie(name, signValue(payload, maxAgeSeconds), {
    ...COOKIE_BASE_OPTIONS,
    secure: req.secure,
    maxAge: maxAgeSeconds * 1000,
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
