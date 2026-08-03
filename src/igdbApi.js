const { normalizeKey } = require("./parser");

// autentica com as mesmas credenciais da Twitch já usadas pro login (client
// credentials grant) -- a IGDB é mantida pela própria Twitch/Amazon, não
// precisa de chave nova nem aprovação separada. Token dura ~60 dias, cacheado
// até perto de expirar.
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - TOKEN_SAFETY_MARGIN_MS) {
    return tokenCache.accessToken;
  }

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" });
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: params,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Twitch OAuth respondeu ${res.status} ao pedir token pra IGDB`);
  }
  const json = await res.json();
  tokenCache = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return tokenCache.accessToken;
}

function coverUrl(imageId) {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : null;
}

// timeout curto em toda chamada -- sem isso, se a IGDB ficar lenta/fora do
// ar, nossas rotas (busca de jogo, mosaico de fundo) ficam penduradas em vez
// de cair rápido no modo sem busca (jogo digitado manualmente continua
// funcionando, ver botão "+" em doar.js/app.js)
async function igdbQuery(endpoint, body) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("Erro ao autenticar na IGDB:", err.message);
    return null;
  }
  if (!clientId || !accessToken) return null;

  try {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/plain",
      },
      body,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error("IGDB respondeu", res.status, "em", endpoint);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`Erro ao consultar IGDB (${endpoint}):`, err.message);
    return null;
  }
}

const cache = new Map();

let popularCoversCache = { covers: null, fetchedAt: 0 };
const POPULAR_COVERS_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchPopularCovers(count = 30) {
  if (popularCoversCache.covers && Date.now() - popularCoversCache.fetchedAt < POPULAR_COVERS_TTL_MS) {
    return popularCoversCache.covers;
  }

  const results = await igdbQuery(
    "games",
    `fields cover.image_id; where cover != null & total_rating_count > 10; sort total_rating_count desc; limit ${count};`
  );
  if (!results) return popularCoversCache.covers || [];

  const covers = results.map((g) => coverUrl(g.cover && g.cover.image_id)).filter(Boolean);
  popularCoversCache = { covers, fetchedAt: Date.now() };
  return covers;
}

async function fetchGameImage(name) {
  const cacheKey = name.trim().toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const escaped = name.replace(/"/g, '\\"');
  const results = await igdbQuery(
    "games",
    `search "${escaped}"; fields cover.image_id; limit 1;`
  );
  const image = coverUrl(results && results[0] && results[0].cover && results[0].cover.image_id);
  cache.set(cacheKey, image);
  return image;
}

function toYear(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).getUTCFullYear().toString() : null;
}

async function searchGames(query) {
  if (!query || !query.trim()) return [];

  const escaped = query.replace(/"/g, '\\"');
  const results = await igdbQuery(
    "games",
    `search "${escaped}"; fields name,first_release_date,cover.image_id; limit 6;`
  );
  if (!results) return [];

  return results.map((g) => ({
    name: g.name,
    year: toYear(g.first_release_date),
    image: coverUrl(g.cover && g.cover.image_id),
  }));
}

async function identifyGameFromNoisyText(text) {
  if (!text || !text.trim()) return null;

  const escaped = text.replace(/"/g, '\\"');
  const results = await igdbQuery(
    "games",
    `search "${escaped}"; fields name,cover.image_id; limit 1;`
  );
  const top = results && results[0];
  if (!top || !top.name) return null;

  const normalizedCandidate = normalizeKey(top.name);
  const normalizedText = normalizeKey(text);
  if (!normalizedCandidate) return null;
  const escapedRe = normalizedCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\s)${escapedRe}(\\s|$)`);
  if (!re.test(normalizedText)) return null;

  return { name: top.name, image: coverUrl(top.cover && top.cover.image_id) };
}

module.exports = { fetchGameImage, searchGames, identifyGameFromNoisyText, fetchPopularCovers };
