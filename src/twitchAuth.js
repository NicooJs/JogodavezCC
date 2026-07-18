// Login de verdade com a Twitch (Authorization Code Grant) -- diferente de
// src/twitchClient.js, que só faz Client Credentials (token de APP, sem
// usuário nenhum por trás, usado pra buscar avatar por nome digitado). Esse
// arquivo é о que prova QUEM é a pessoa de verdade, por isso fica separado:
// são categorias de confiança diferentes, não vale misturar num arquivo só.
//
// TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET são os mesmos já usados em
// twitchClient.js (um app só, pro site inteiro) -- lidos direto do
// process.env aqui dentro, mesmo padrão do arquivo irmão.

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

// Troca o "code" (de uso único, a própria Twitch invalida depois do primeiro
// uso) por um token de USUÁRIO -- diferente do token de app em
// twitchClient.js#getAppToken. Mesmo formato de "parâmetros na query string
// de um POST sem corpo" que getAppToken já usa, reaproveitado por
// consistência.
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

// GET /helix/users SEM "login=" devolve o dono do PRÓPRIO token -- é assim
// que confirmamos "quem está logado", em vez de confiar em qualquer coisa
// que o cliente diga. id é o identificador estável (login pode mudar,
// id não), por isso é o que vira a chave de posse do leilão.
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
