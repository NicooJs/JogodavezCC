// Mosaico de capas de jogos no fundo do board, estilo tela de login da
// Steam -- busca /api/board-bg-covers (lista genérica de capas populares,
// não depende do leilão atual) e monta um grid que faz um pan bem lento.
// Camada aditiva sobre o fundo de losangos (board-bg.js): só troca pra ela
// (.has-covers no <body>, ver style.css) depois que pelo menos 1 capa
// carrega de verdade. Sem RAWG_API_KEY, lista vazia ou falha de rede, essa
// função simplesmente não faz nada e o losango continua sendo o fundo --
// igual o resto da integração com a RAWG no projeto, "sem quebrar nada".

const TILE_TARGET_PX = 190; // ~lado de cada tile (ver aspect-ratio 3/4 e minmax no CSS)
const MAX_TILES = 140; // teto de sanidade pra telas muito grandes

async function init() {
  // Não checa .has-bg-image aqui: app.js aplica essa classe de forma
  // assíncrona (depois do estado do leilão chegar), então checar só na
  // largada teria corrida. A regra CSS (.has-bg-image .board-cover-bg {
  // display:none }) já resolve isso de forma reativa e correta -- some
  // sozinho se a classe aparecer a qualquer momento, sem race condition.

  let covers = [];
  try {
    const res = await fetch("/api/board-bg-covers");
    if (res.ok) {
      const json = await res.json();
      covers = Array.isArray(json.covers) ? json.covers.filter(Boolean) : [];
    }
  } catch (err) {
    return; // rede falhou -- silencioso, fundo de losango segue sozinho
  }
  if (!covers.length) return;

  const grid = document.createElement("div");
  grid.className = "board-cover-bg-grid";
  const veil = document.createElement("div");
  veil.className = "board-cover-bg-veil";

  const wrap = document.createElement("div");
  wrap.className = "board-cover-bg";
  wrap.setAttribute("aria-hidden", "true");
  wrap.append(grid, veil);
  document.body.prepend(wrap);

  // A área do grid é 130% x 150% do viewport (ver CSS) -- estima quantas
  // tiles cabem nisso pra não sobrar vazio nem desperdiçar tiles fora de
  // tela.
  const cols = Math.ceil((window.innerWidth * 1.3) / TILE_TARGET_PX);
  const rows = Math.ceil((window.innerHeight * 1.5) / ((TILE_TARGET_PX * 4) / 3));
  const tileCount = Math.min(cols * rows, MAX_TILES);

  let revealed = false;
  const revealIfReady = () => {
    if (revealed) return;
    revealed = true;
    document.body.classList.add("has-covers");
  };

  for (let i = 0; i < tileCount; i++) {
    const url = covers[Math.floor(Math.random() * covers.length)];
    const tile = document.createElement("div");
    tile.className = "board-cover-bg-tile";
    grid.appendChild(tile);

    const img = new Image();
    img.onload = () => {
      tile.style.backgroundImage = `url("${url}")`;
      revealIfReady();
    };
    img.src = url;
  }
}

init();
