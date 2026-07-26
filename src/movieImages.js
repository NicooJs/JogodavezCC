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
    return image;
  } catch (err) {
    console.error("Erro ao buscar pôster do filme na TMDB:", err.message);
    return null;
  }
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

module.exports = { fetchGameImage, searchGames, identifyGameFromNoisyText, fetchPopularCovers };
