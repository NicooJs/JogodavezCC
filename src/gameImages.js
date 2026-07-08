// Busca a imagem de capa de um jogo na RAWG (banco de dados aberto de jogos).
// Crie uma chave grátis em https://rawg.io/apidocs e coloque em RAWG_API_KEY no .env.
// Sem a chave configurada, os jogos simplesmente aparecem sem imagem (não quebra nada).

const cache = new Map(); // nome normalizado -> URL da imagem (ou null se não achou)

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

// Sugestões pro autocomplete do lançamento manual (modo apresentador).
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

module.exports = { fetchGameImage, searchGames };
