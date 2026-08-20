const cache = new Map();

let appToken = null;
let appTokenExpiresAt = 0;

async function getAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (appToken && Date.now() < appTokenExpiresAt) return appToken;

  const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Twitch OAuth respondeu ${res.status}`);

  const json = await res.json();
  appToken = json.access_token;
  appTokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;
  return appToken;
}

async function fetchTwitchAvatar(login) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return null;

  const cacheKey = login.trim().toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const token = await getAppToken();
    if (!token) return null;

    const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cacheKey)}`, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
    });

    if (!res.ok) {
      console.error("Twitch respondeu", res.status, "ao buscar", login);
      return null;
    }

    const json = await res.json();
    const user = json.data && json.data[0];
    const avatarUrl = (user && user.profile_image_url) || null;
    cache.set(cacheKey, avatarUrl);
    return avatarUrl;
  } catch (err) {
    console.error("Erro ao buscar avatar na Twitch:", err.message);
    return null;
  }
}

// wallpaper do banner de perfil (Histórico do hub) -- o banner de fundo
// do canal (o que o streamer configura em "Banner" no Creator Dashboard,
// a imagem larga atrás do player) NUNCA foi exposto pela API oficial da
// Twitch (Helix) -- só existia na API antiga (Kraken v5), desativada há
// anos, sem substituto oficial. A ÚNICA forma de conseguir esse campo
// hoje é a API interna (não documentada) que o próprio site da Twitch
// usa, com o Client-Id público do web client deles (não é segredo nosso,
// é o mesmo client-id embutido no JS público de twitch.tv, usado por
// praticamente toda ferramenta terceira que mostra isso). Decisão
// consciente do cliente (2026-08-17), sabendo do risco: sem contrato de
// estabilidade, pode quebrar ou ser bloqueada sem aviso -- diferente de
// TUDO mais nesse arquivo, que usa só Helix oficial autenticado com
// nossas próprias credenciais. Se um dia parar de funcionar, cai
// graciosamente pro degradê (nunca derruba o Histórico).
const TWITCH_WEB_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

// Cache/função separada de fetchTwitchAvatar de propósito: avatar é
// chamado com MUITOS logins diferentes (todo doador que aparece no
// board), banner só é chamado pro próprio streamer dono do perfil (uma
// vez por carregamento do Histórico) -- juntar os dois faria toda busca
// de avatar de doador puxar um campo que nunca usa.
const bannerCache = new Map();

async function fetchTwitchChannelBanner(login) {
  const cacheKey = login.trim().toLowerCase();
  if (bannerCache.has(cacheKey)) return bannerCache.get(cacheKey);

  try {
    const res = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: { "Client-Id": TWITCH_WEB_CLIENT_ID, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query($login: String!) { user(login: $login) { bannerImageURL } }",
        variables: { login: cacheKey },
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.error("Twitch (gql interno) respondeu", res.status, "ao buscar banner de", login);
      bannerCache.set(cacheKey, null);
      return null;
    }

    const json = await res.json();
    const bannerUrl = (json.data && json.data.user && json.data.user.bannerImageURL) || null;
    bannerCache.set(cacheKey, bannerUrl);
    return bannerUrl;
  } catch (err) {
    console.error("Erro ao buscar banner do canal na Twitch (gql interno):", err.message);
    return null;
  }
}

module.exports = { fetchTwitchAvatar, fetchTwitchChannelBanner };
