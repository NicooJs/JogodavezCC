const { normalizeKey } = require("./parser");

const cache = new Map();

let popularCoversCache = { covers: null, fetchedAt: 0 };
const POPULAR_COVERS_TTL_MS = 6 * 60 * 60 * 1000;

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";

function posterUrl(path) {
  return path ? `${POSTER_BASE}${path}` : null;
}

async function fetchPopularCovers(count = 30) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return [];

  if (popularCoversCache.covers && Date.now() - popularCoversCache.fetchedAt < POPULAR_COVERS_TTL_MS) {
    return popularCoversCache.covers;
  }

  try {
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=pt-BR&page=1`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("TMDB respondeu", res.status, "ao buscar filmes populares");
      return popularCoversCache.covers || [];
    }

    const json = await res.json();
    const covers = (json.results || [])
      .map((m) => posterUrl(m.poster_path))
      .filter(Boolean)
      .slice(0, count);

    popularCoversCache = { covers, fetchedAt: Date.now() };
    return covers;
  } catch (err) {
    console.error("Erro ao buscar capas populares na TMDB:", err.message);
    return popularCoversCache.covers || [];
  }
}

// lista de gêneros do TMDB é estática (não muda), busca só uma vez e
// mantém em memória -- a busca de filme só devolve genre_ids (números),
// precisa desse mapa pra virar nome
let genreListPromise = null;
async function getGenreMap() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return new Map();
  if (!genreListPromise) {
    genreListPromise = fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}&language=pt-BR`)
      .then((res) => (res.ok ? res.json() : { genres: [] }))
      .then((json) => new Map((json.genres || []).map((g) => [g.id, g.name])))
      .catch(() => new Map());
  }
  return genreListPromise;
}

// gênero pega carona na mesma busca que já resolve o pôster -- sem chamada
// extra à TMDB pra cada filme (só a lista de gêneros, uma vez). Efeito
// colateral de fetchGameImage, getCachedGenre só lê o que já foi resolvido.
const genreCache = new Map();

async function fetchGameImage(name) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const cacheKey = name.trim().toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(name)}&language=pt-BR&page=1`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("TMDB respondeu", res.status, "ao buscar", name);
      return null;
    }

    const json = await res.json();
    const first = json.results && json.results[0];
    const image = posterUrl(first && first.poster_path);
    cache.set(cacheKey, image);

    const firstGenreId = first && first.genre_ids && first.genre_ids[0];
    const genreMap = await getGenreMap();
    genreCache.set(cacheKey, genreMap.get(firstGenreId) || null);

    return image;
  } catch (err) {
    console.error("Erro ao buscar pôster do filme na TMDB:", err.message);
    return null;
  }
}

function getCachedGenre(name) {
  return genreCache.get(name.trim().toLowerCase()) || null;
}

async function searchGames(query) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || !query || !query.trim()) return [];

  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=pt-BR&page=1`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const json = await res.json();
    return (json.results || []).slice(0, 6).map((m) => ({
      name: m.title,
      year: m.release_date ? m.release_date.slice(0, 4) : null,
      image: posterUrl(m.poster_path),
    }));
  } catch (err) {
    console.error("Erro ao buscar sugestões na TMDB:", err.message);
    return [];
  }
}

async function identifyGameFromNoisyText(text) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || !text || !text.trim()) return null;

  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(text)}&language=pt-BR&page=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    const top = json.results && json.results[0];
    if (!top || !top.title) return null;

    const normalizedCandidate = normalizeKey(top.title);
    const normalizedText = normalizeKey(text);
    if (!normalizedCandidate) return null;
    const escaped = normalizedCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    if (!re.test(normalizedText)) return null;

    return { name: top.title, image: posterUrl(top.poster_path) };
  } catch (err) {
    console.error("Erro ao identificar filme via TMDB:", err.message);
    return null;
  }
}

module.exports = { fetchGameImage, searchGames, identifyGameFromNoisyText, fetchPopularCovers, getCachedGenre };
