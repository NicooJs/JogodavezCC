// Mosaico de capas de jogos atrás do board. Camada aditiva sobre os
// losangos do board-bg.js: só troca (.has-covers no <body>) depois que
// pelo menos uma capa carrega de verdade. Sem RAWG_API_KEY, lista vazia ou
// falha de rede, não faz nada e o fundo de losango continua.

const TILE_TARGET_PX = 190;
const MAX_TILES = 140;

async function init() {
  // Não checa .has-bg-image aqui: app.js aplica essa classe de forma
  // assíncrona, então checar só na largada teria corrida. A regra CSS já
  // resolve isso de forma reativa (display:none quando a classe aparecer).

  let covers = [];
  try {
    const res = await fetch("/api/board-bg-covers");
    if (res.ok) {
      const json = await res.json();
      covers = Array.isArray(json.covers) ? json.covers.filter(Boolean) : [];
    }
  } catch (err) {
    return;
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

  // Área do grid é 130% x 150% do viewport (ver CSS); estima quantas tiles
  // cabem nisso sem sobrar vazio nem desperdiçar tiles fora de tela.
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
