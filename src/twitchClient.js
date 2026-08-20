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

// wallpaper do banner de perfil (Histórico do hub) -- offline_image_url é
// a arte que a própria Twitch mostra quando o canal tá offline, cadastrada
// pelo streamer no painel dele. Cache/função separada de fetchTwitchAvatar
// de propósito: avatar é chamado com MUITOS logins diferentes (todo doador
// que aparece no board), banner só é chamado pro próprio streamer dono do
// perfil (uma vez por carregamento do Histórico) -- juntar os dois faria
// toda busca de avatar de doador puxar um campo que nunca usa.
const bannerCache = new Map();

async function fetchTwitchChannelBanner(login) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return null;

  const cacheKey = login.trim().toLowerCase();
  if (bannerCache.has(cacheKey)) return bannerCache.get(cacheKey);

  try {
    const token = await getAppToken();
    if (!token) return null;

    const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cacheKey)}`, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
    });

    if (!res.ok) {
      console.error("Twitch respondeu", res.status, "ao buscar banner de", login);
      return null;
    }

    const json = await res.json();
    const user = json.data && json.data[0];
    const bannerUrl = (user && user.offline_image_url) || null;
    bannerCache.set(cacheKey, bannerUrl);
    return bannerUrl;
  } catch (err) {
    console.error("Erro ao buscar banner do canal na Twitch:", err.message);
    return null;
  }
}

module.exports = { fetchTwitchAvatar, fetchTwitchChannelBanner };
