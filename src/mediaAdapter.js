const gameImages = require("./gameImages");
const movieImages = require("./movieImages");

const MODES = new Set(["jogos", "filmes"]);

function normalizeMode(mode) {
  return MODES.has(mode) ? mode : "jogos";
}

// escolhe a fonte de busca/capa (RAWG ou TMDB) pela modalidade do leilão --
// as duas expõem a mesma interface (fetchGameImage, searchGames,
// identifyGameFromNoisyText, fetchPopularCovers), então o resto do server
// não precisa saber qual delas tá sendo usada
function getMediaAdapter(store) {
  return normalizeMode(store.getState("mode", "jogos")) === "filmes" ? movieImages : gameImages;
}

function mediaLabel(store) {
  return normalizeMode(store.getState("mode", "jogos")) === "filmes" ? "filme" : "jogo";
}

module.exports = { getMediaAdapter, mediaLabel, normalizeMode, MODES };
