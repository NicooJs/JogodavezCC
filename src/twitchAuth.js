// Login de verdade com a Twitch (Authorization Code Grant) -- diferente de
// src/twitchClient.js, que só faz Client Credentials (token de APP, sem
// usuário por trás, usado pra buscar avatar por nome digitado). Esse
// arquivo é o que prova QUEM é a pessoa de verdade, por isso fica
// separado: são categorias de confiança diferentes.
//
// TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET são os mesmos usados em
// twitchClient.js (um app só, pro site inteiro).

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";

function buildAuthorizeUrl({ redirectUri, state }) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("TWITCH_CLIENT_ID não configurado");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "", // só precisamos de id/login/display_name/profile_image_url, que /helix/users devolve pro dono do próprio token sem escopo extra nenhum
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// "code" é de uso único, a Twitch invalida depois do primeiro uso. Troca
// por um token de USUÁRIO -- diferente do token de app em
// twitchClient.js#getAppToken.
async function exchangeCodeForToken({ code, redirectUri }) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET não configurados");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(`${TOKEN_URL}?${params.toString()}`, { method: "POST" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twitch recusou o código de autorização (status ${res.status}). ${detail}`.trim());
  }

  const json = await res.json();
  if (!json.access_token) throw new Error("Twitch não devolveu access_token");
  return json.access_token;
}

// GET /helix/users sem "login=" devolve o dono do PRÓPRIO token -- confirma
// "quem está logado" sem confiar em nada que o cliente diga. id é o
// identificador estável (login pode mudar), por isso vira a chave de posse
// do leilão.
async function fetchAuthenticatedUser(accessToken) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("TWITCH_CLIENT_ID não configurado");

  const res = await fetch(USERS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Falha ao buscar usuário autenticado na Twitch (status ${res.status}). ${detail}`.trim());
  }

  const json = await res.json();
  const user = json.data && json.data[0];
  if (!user) throw new Error("Twitch não devolveu nenhum usuário pro token informado");

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    avatarUrl: user.profile_image_url || null,
  };
}

module.exports = { buildAuthorizeUrl, exchangeCodeForToken, fetchAuthenticatedUser };
