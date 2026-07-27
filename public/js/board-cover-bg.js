
const TILE_TARGET_PX = 190;
const MAX_TILES = 140;

async function init() {
  // sem checar .has-bg-image aqui: a classe é aplicada async por app.js, o CSS resolve a corrida

  document.querySelector(".board-cover-bg")?.remove();
  document.body.classList.remove("has-covers");

  const leilaoId = location.pathname.match(/^\/l\/([a-z0-9_-]+)/i)?.[1] || "";

  let covers = [];
  try {
    const res = await fetch(`/api/board-bg-covers?leilaoId=${encodeURIComponent(leilaoId)}`);
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

  // 1.3x/1.5x do viewport pra bater com a área do grid definida no CSS
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
    img.onerror = () => {
      console.warn("[board-cover-bg] falha ao carregar capa:", url);
    };
    img.src = url;
  }
}

init();
window.refreshBoardCoverBg = init;
