// Busca a imagem de capa de um jogo na RAWG (banco de dados aberto de jogos).
// Crie uma chave grátis em https://rawg.io/apidocs e coloque em RAWG_API_KEY no .env.
// Sem a chave configurada, os jogos simplesmente aparecem sem imagem (não quebra nada).

const { normalizeKey } = require("./parser");

const cache = new Map(); // nome normalizado -> URL da imagem (ou null se não achou)

// Mesma lista pra qualquer leilão/visitante — cacheada com TTL pra não bater
// na RAWG a cada carregamento de board (rate limit com muitos espectadores).
let popularCoversCache = { covers: null, fetchedAt: 0 };
const POPULAR_COVERS_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

async function fetchPopularCovers(count = 30) {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return [];

  if (popularCoversCache.covers && Date.now() - popularCoversCache.fetchedAt < POPULAR_COVERS_TTL_MS) {
    return popularCoversCache.covers;
  }

  try {
    // ordering=-added: mais adicionados na RAWG, proxy de "jogo conhecido".
    const url = `https://api.rawg.io/api/games?ordering=-added&page_size=${count}&key=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "leilao-de-jogos (uso pessoal)" },
    });

    if (!res.ok) {
      console.error("RAWG respondeu", res.status, "ao buscar capas populares");
      return popularCoversCache.covers || []; // erro passageiro: mantém a lista antiga se tiver uma
    }

    const json = await res.json();
    const covers = (json.results || [])
      .map((g) => g.background_image)
      .filter(Boolean);

    popularCoversCache = { covers, fetchedAt: Date.now() };
    return covers;
  } catch (err) {
    console.error("Erro ao buscar capas populares na RAWG:", err.message);
    return popularCoversCache.covers || [];
  }
}

async function fetchGameImage(name) {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return null;

  const cacheKey = name.trim().toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(name)}&page_size=1&key=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "leilao-de-jogos (uso pessoal)" },
    });

    if (!res.ok) {
      // não guarda no cache: pode ser um erro passageiro (rate limit, chave
      // recém-configurada) e vale tentar de novo na próxima contribuição.
      console.error("RAWG respondeu", res.status, "ao buscar", name);
      return null;
    }

    const json = await res.json();
    const first = json.results && json.results[0];
    const image = (first && first.background_image) || null;
    cache.set(cacheKey, image);
    return image;
  } catch (err) {
    console.error("Erro ao buscar imagem do jogo na RAWG:", err.message);
    return null;
  }
}

async function searchGames(query) {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey || !query || !query.trim()) return [];

  try {
    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&page_size=6&key=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "leilao-de-jogos (uso pessoal)" },
    });
    if (!res.ok) return [];

    const json = await res.json();
    return (json.results || []).map((g) => ({
      name: g.name,
      year: g.released ? g.released.slice(0, 4) : null,
      image: g.background_image || null,
    }));
  } catch (err) {
    console.error("Erro ao buscar sugestões na RAWG:", err.message);
    return [];
  }
}

// Extrai o nome "limpo" de um jogo de uma mensagem barulhenta (ex:
// "minecraft coloca ele ai!!" -> "Minecraft"). Só pra PRIMEIRA menção de um
// jogo — pra jogo já catalogado quem resolve é resolveExistingKey em db.js,
// mais barato por não bater na RAWG.
//
// Só confia no resultado se o nome aparecer, por palavra inteira, no texto
// original — evita a busca fuzzy da RAWG "inventar" um jogo pra texto
// barulhento demais (ex: só um emoji).
async function identifyGameFromNoisyText(text) {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey || !text || !text.trim()) return null;

  try {
    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(text)}&page_size=1&key=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "leilao-de-jogos (uso pessoal)" },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const top = json.results && json.results[0];
    if (!top || !top.name) return null;

    const normalizedCandidate = normalizeKey(top.name);
    const normalizedText = normalizeKey(text);
    if (!normalizedCandidate) return null;
    const escaped = normalizedCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    if (!re.test(normalizedText)) return null;

    return { name: top.name, image: top.background_image || null };
  } catch (err) {
    console.error("Erro ao identificar jogo via RAWG:", err.message);
    return null;
  }
}

module.exports = { fetchGameImage, searchGames, identifyGameFromNoisyText, fetchPopularCovers };
