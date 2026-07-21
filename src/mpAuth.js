// OAuth marketplace do Mercado Pago -- conecta a conta MP de um streamer
// (via twitch_user_id, ver server.js) pra depois cobrar em nome dele com
// split. Espelha src/twitchAuth.js de propósito: mesmo formato geral de
// buildAuthorizeUrl/exchangeCodeForToken, mesma disciplina de ler
// MP_CLIENT_ID/MP_CLIENT_SECRET direto do process.env aqui dentro.
//
// PKCE (code_challenge) é opcional no MP, não obrigatório a menos que
// habilitado nas configurações da aplicação -- não implementado aqui de
// propósito (mesmo raciocínio de "não adicionar o que não é preciso"); se
// a aplicação exigir depois, dá pra adicionar sem mudar a forma geral
// dessas duas funções.
const AUTHORIZE_URL = "https://auth.mercadopago.com/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";

function buildAuthorizeUrl({ redirectUri, state }) {
  const clientId = process.env.MP_CLIENT_ID;
  if (!clientId) throw new Error("MP_CLIENT_ID não configurado");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Troca o "code" por access_token/refresh_token/user_id/public_key. O
// refresh_token do MP RODA a cada uso (não só na conexão inicial) -- quem
// chama isso (ou refreshToken abaixo) precisa regravar os dois tokens
// toda vez, nunca só o access_token sozinho.
async function exchangeCodeForToken({ code, redirectUri }) {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MP_CLIENT_ID / MP_CLIENT_SECRET não configurados");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mercado Pago recusou o código de autorização (status ${res.status}). ${detail}`.trim());
  }

  const json = await res.json();
  if (!json.access_token || !json.refresh_token) {
    throw new Error("Mercado Pago não devolveu access_token/refresh_token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    userId: json.user_id,
    publicKey: json.public_key || null,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
  };
}

// Renova o access_token quando expira (~180 dias) OU quando uma chamada
// real devolve 401 -- mesmo formato de resposta do exchangeCodeForToken
// (o refresh_token novo TAMBÉM precisa ser regravado, o antigo para de
// funcionar depois de usado).
async function refreshToken({ refreshToken: currentRefreshToken }) {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MP_CLIENT_ID / MP_CLIENT_SECRET não configurados");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mercado Pago recusou a renovação de token (status ${res.status}). ${detail}`.trim());
  }

  const json = await res.json();
  if (!json.access_token || !json.refresh_token) {
    throw new Error("Mercado Pago não devolveu access_token/refresh_token na renovação");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    userId: json.user_id,
    publicKey: json.public_key || null,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
  };
}

module.exports = { buildAuthorizeUrl, exchangeCodeForToken, refreshToken };
