const OAUTH_URL = "https://oauth.livepix.gg/oauth2/token";
const API_BASE = "https://api.livepix.gg/v2";

// Escopos que o app precisa ter aprovados nas configurações do LivePix.
// Se dado 401 ao buscar mensagens, confira se "messages" (leitura) está marcado
// nas permissões do seu app em https://livepix.gg (Configurações > Aplicações).
const SCOPES = "account:read wallet:read messages:read webhooks";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const clientId = process.env.LIVEPIX_CLIENT_ID;
  const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "LIVEPIX_CLIENT_ID / LIVEPIX_CLIENT_SECRET não configurados no .env"
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPES,
  });

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha ao obter token OAuth do LivePix (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function apiRequest(pathname, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Erro na API LivePix ${pathname} (${res.status}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// Busca os detalhes completos de uma mensagem (o webhook só manda o ID)
async function fetchMessage(messageId) {
  const json = await apiRequest(`/messages/${messageId}`);
  return json.data;
}

async function registerWebhook(url) {
  const json = await apiRequest("/webhooks", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return json.data;
}

async function listWebhooks() {
  const json = await apiRequest("/webhooks");
  return json.data;
}

async function deleteWebhook(webhookId) {
  await apiRequest(`/webhooks/${webhookId}`, { method: "DELETE" });
}

module.exports = {
  getAccessToken,
  fetchMessage,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
};
