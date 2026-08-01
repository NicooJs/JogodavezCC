const { request, getConfig } = require("./efiClient");

const tokenCache = new Map();

async function getAccessToken(env = "producao") {
  const cached = tokenCache.get(env);
  if (cached && cached.expiresAt > Date.now() + 5000) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = getConfig(env);
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const json = await request(env, {
    method: "POST",
    path: "/oauth/token",
    headers: { Authorization: `Basic ${basicAuth}` },
    body: { grant_type: "client_credentials" },
  });

  if (!json.access_token) {
    throw new Error("Efí não devolveu access_token");
  }

  const expiresAt = Date.now() + (json.expires_in ? json.expires_in * 1000 : 3600 * 1000);
  tokenCache.set(env, { accessToken: json.access_token, expiresAt });
  return json.access_token;
}

module.exports = { getAccessToken };
