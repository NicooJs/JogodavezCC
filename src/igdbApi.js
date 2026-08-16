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

// uma rajada de doações (várias pessoas doando junto, ex: disputa por um
// jogo popular) pode disparar dezenas de identifyGameFromNoisyText ao mesmo
// tempo -- sem isso, cada uma delas soltava sua chamada pra IGDB em paralelo
// sem limite nenhum, o que já derrubou o servidor de produção uma vez (ver
// docs/STATUS-EFI.md).
//
// só limitar CONCORRÊNCIA não bastou: testado ao vivo, a própria IGDB já
// devolve 429 (limite de taxa) numa rajada de só 15 doações mesmo com no
// máximo 4 chamadas simultâneas -- o limite deles é por REQUISIÇÕES POR
// SEGUNDO, não por quantas rodam ao mesmo tempo. Por isso isso aqui espaça o
// INÍCIO de cada chamada em vez de só limitar quantas ficam abertas.
const IGDB_MIN_DISPATCH_INTERVAL_MS = 260; // ~3.8 req/s, folga sobre o limite documentado de 4/s
let lastIgdbDispatchAt = 0;
const igdbRequestQueue = [];
let igdbQueueTimer = null;

function processIgdbQueue() {
  if (igdbQueueTimer || !igdbRequestQueue.length) return;
  const wait = Math.max(0, lastIgdbDispatchAt + IGDB_MIN_DISPATCH_INTERVAL_MS - Date.now());
  igdbQueueTimer = setTimeout(() => {
    igdbQueueTimer = null;
    lastIgdbDispatchAt = Date.now();
    const job = igdbRequestQueue.shift();
    if (job) job();
    processIgdbQueue();
  }, wait);
}

function runQueuedIgdbRequest(task) {
  return new Promise((resolve) => {
    igdbRequestQueue.push(() => resolve(task()));
    processIgdbQueue();
  });
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

  return runQueuedIgdbRequest(async () => {
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
  });
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

// resultado mais "relevante" da IGDB pra um nome de jogo nem sempre é o
// próprio jogo -- "Valorant" já devolveu "Grit & Valor: 1949" em primeiro
// (confirmado testando ao vivo, capa errada foi parar no board de verdade).
// name aqui já é um nome limpo e resolvido, então prioriza um candidato cujo
// nome bate exatamente antes de aceitar só o mais "relevante" pra IGDB
// gênero pega carona na mesma busca que já resolve a capa -- sem chamada
// extra à IGDB. genreCache é só um efeito colateral de fetchGameImage,
// getCachedGenre (chamado depois, do server.js) só lê o que já foi
// resolvido; se fetchGameImage nunca rodou pra esse nome, fica sem gênero
// (aceitável, é estatística "bônus", não bloqueia nada).
const genreCache = new Map();

async function fetchGameImage(name) {
  const cacheKey = name.trim().toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const escaped = name.replace(/"/g, '\\"');
  const results = await igdbQuery(
    "games",
    `search "${escaped}"; fields name,cover.image_id,genres.name; limit 8;`
  );

  const normalizedName = normalizeKey(name);
  const best = (results || []).find((g) => normalizeKey(g.name) === normalizedName) || (results && results[0]);
  const image = coverUrl(best && best.cover && best.cover.image_id);
  cache.set(cacheKey, image);
  genreCache.set(cacheKey, (best && best.genres && best.genres[0] && best.genres[0].name) || null);
  return image;
}

function getCachedGenre(name) {
  return genreCache.get(name.trim().toLowerCase()) || null;
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

function nameAppearsInText(name, normalizedText) {
  const normalizedCandidate = normalizeKey(name);
  if (!normalizedCandidate) return false;
  const escapedRe = normalizedCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\s)${escapedRe}(\\s|$)`);
  return re.test(normalizedText);
}

// jogo obscuro sem avaliação nenhuma pode ter um apelido cadastrado na IGDB
// que colide por coincidência com uma sigla comum (ex: "CoD" já é apelido de
// uma DLC de Five Nights at Freddy's) -- só confia em apelido pra jogo com
// avaliação suficiente pra ser algo que a audiência plausivelmente conhece
// pela sigla; nome oficial continua sem essa exigência (já era seguro antes)
const MIN_RATING_COUNT_FOR_ALIAS_MATCH = 10;

async function searchGamesRaw(query) {
  const escaped = query.replace(/"/g, '\\"');
  return igdbQuery(
    "games",
    `search "${escaped}"; fields name,alternative_names.name,total_rating_count,cover.image_id; limit 8;`
  );
}

// além do nome oficial, confere os apelidos/siglas que a própria IGDB já
// cataloga (alternative_names -- ex: "GTA 5" pra "Grand Theft Auto V") antes
// de aceitar um match automático, sem precisar manter lista própria de sigla.
//
// a busca da IGDB devolve vazio assim que sobra qualquer palavra de ruído
// depois do nome do jogo (confirmado testando contra a API real) -- por isso
// tenta a frase inteira primeiro e vai cortando a última palavra até achar
// candidatos. Isso NÃO afrouxa a segurança: o nome/apelido batido continua
// precisando aparecer literalmente no texto ORIGINAL (não no texto cortado),
// então um resultado tipo "Just Cause" pra "just dance 2024 top demais" ainda
// é rejeitado -- só muda o que é mandado pra busca, não o que é aceito dela.
//
// no máximo MAX_PREFIX_ATTEMPTS chamadas por doação, mesmo pra mensagem bem
// longa/ruidosa -- sem isso, uma rajada de doações de jogos novos multiplica
// rápido demais o número de chamadas simultâneas à IGDB (ver runQueuedIgdbRequest)
const MAX_PREFIX_ATTEMPTS = 6;

async function identifyGameFromNoisyText(text) {
  if (!text || !text.trim()) return null;

  const normalizedText = normalizeKey(text);
  const words = text.trim().split(/\s+/);

  let results = null;
  let attempts = 0;
  for (let len = words.length; len >= 1 && !results && attempts < MAX_PREFIX_ATTEMPTS; len--) {
    attempts++;
    const fetched = await searchGamesRaw(words.slice(0, len).join(" "));
    if (fetched && fetched.length) results = fetched;
  }
  if (!results) return null;

  for (const candidate of results) {
    if (!candidate.name) continue;
    if (nameAppearsInText(candidate.name, normalizedText)) {
      return { name: candidate.name, image: coverUrl(candidate.cover && candidate.cover.image_id) };
    }
    const isPopularEnough = (candidate.total_rating_count || 0) >= MIN_RATING_COUNT_FOR_ALIAS_MATCH;
    if (isPopularEnough && (candidate.alternative_names || []).some((a) => nameAppearsInText(a.name, normalizedText))) {
      return { name: candidate.name, image: coverUrl(candidate.cover && candidate.cover.image_id) };
    }
  }

  return null;
}

module.exports = { fetchGameImage, searchGames, identifyGameFromNoisyText, fetchPopularCovers, getCachedGenre };
