// Página de histórico é servida em /l/<id>/historico — mesma convenção de
// path que board.html e admin.html usam pra descobrir o leilão.
const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/historico/i)?.[1] || null;

if (!LEILAO_ID) {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#ccc;background:#1c1c1f;">Link inválido. Volte pra <a href="/" style="color:#ff7a45;">criar ou achar o seu leilão</a>.</p>';
  throw new Error("LEILAO_ID ausente na URL");
}

document.getElementById("back-link").href = `/l/${LEILAO_ID}`;

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  if (totalMin === 0) return "<1min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

// Mesma medalha usada no catálogo do board e no quadro de honra (ver
// MEDAL_ICON_SVG em app.js) — duplicado aqui de propósito, o projeto não
// usa bundler/módulo compartilhado entre as páginas.
const MEDAL_ICON_SVG = `<svg class="medal-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M7.5 11L4.5 17.5L7.3 16.6L9 19L10.8 14.8" fill="currentColor" opacity="0.85"/>
  <path d="M12.5 11L15.5 17.5L12.7 16.6L11 19L9.2 14.8" fill="currentColor" opacity="0.85"/>
  <circle cx="10" cy="7.5" r="5.5" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4"/>
  <rect x="8.6" y="6.1" width="2.8" height="2.8" fill="currentColor" transform="rotate(45 10 7.5)"/>
</svg>`;

function rankBadgeHtml(rank) {
  const num = `<b>${String(rank).padStart(2, "0")}</b>`;
  return rank <= 3 ? MEDAL_ICON_SVG + num : num;
}

function recapPodiumCardHtml(game) {
  const thumb = game.image
    ? `<img class="recap-podium-thumb" src="${escapeHtml(game.image)}" alt="" />`
    : `<div class="recap-podium-thumb recap-podium-thumb-placeholder">${escapeHtml((game.name[0] || "?").toUpperCase())}</div>`;
  return `
    <div class="recap-podium-card rank-${game.rank}">
      <span class="recap-podium-rank">${rankBadgeHtml(game.rank)}</span>
      ${thumb}
      <p class="recap-podium-name">${escapeHtml(game.name)}</p>
      <p class="recap-podium-total">${formatBRL(game.total)}</p>
      <p class="recap-podium-donors">${game.donorCount} ${game.donorCount === 1 ? "apoiador" : "apoiadores"}</p>
    </div>
  `;
}

const recapOverlayEl = document.getElementById("recap-overlay");
const recapEyebrowEl = document.getElementById("recap-eyebrow");
const recapTitleEl = document.getElementById("recap-title");
const recapTotalEl = document.getElementById("recap-total");
const recapDurationEl = document.getElementById("recap-duration");
const recapDonorsEl = document.getElementById("recap-donors");
const recapGamesEl = document.getElementById("recap-games");
const recapPodiumEl = document.getElementById("recap-podium");
const recapDonorListEl = document.getElementById("recap-donor-list");
const recapDonorsLabelEl = document.getElementById("recap-donors-label");
const recapCloseEl = document.getElementById("recap-close");

function renderRecap(recap, eyebrowText) {
  recapEyebrowEl.textContent = eyebrowText;
  recapTitleEl.textContent = recap.title || "Leilão de Jogos";
  recapTotalEl.textContent = formatBRL(recap.totalRaised || 0);
  recapDurationEl.textContent = formatDuration(recap.durationMs);
  recapDonorsEl.textContent = String(recap.totalDonors || 0);
  recapGamesEl.textContent = String(recap.totalGames || 0);

  recapPodiumEl.innerHTML = (recap.topGames || []).map(recapPodiumCardHtml).join("");

  const topDonors = recap.topDonors || [];
  recapDonorsLabelEl.hidden = topDonors.length === 0;
  recapDonorListEl.innerHTML = topDonors.map((d) => `
    <div class="recap-donor-row rank-${d.rank}">
      <span class="recap-donor-rank">${rankBadgeHtml(d.rank)}</span>
      <span class="recap-donor-name">${escapeHtml(d.username || "Anônimo")}</span>
      <span class="recap-donor-total">${formatBRL(d.total)}</span>
    </div>
  `).join("");

  recapOverlayEl.hidden = false;
}

function closeRecap() {
  recapOverlayEl.hidden = true;
}

recapCloseEl.addEventListener("click", closeRecap);
recapOverlayEl.addEventListener("click", (e) => { if (e.target === recapOverlayEl) closeRecap(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !recapOverlayEl.hidden) closeRecap(); });

function historyCardHtml(h, index) {
  const when = h.archivedAt ? new Date(h.archivedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const champion = h.topGames && h.topGames[0] ? h.topGames[0] : null;
  const thumb = champion && champion.image
    ? `<img class="history-card-thumb" src="${escapeHtml(champion.image)}" alt="" />`
    : `<div class="history-card-thumb history-card-thumb-placeholder">${escapeHtml(((champion && champion.name[0]) || "?").toUpperCase())}</div>`;
  return `
    <button class="history-card" type="button" data-index="${index}">
      <span class="history-card-when">${when}</span>
      <span class="history-card-total">${formatBRL(h.totalRaised || 0)}</span>
      <div class="history-card-champion">
        ${thumb}
        <div class="history-card-champion-text">
          <span class="history-card-champion-label">campeão</span>
          <span class="history-card-champion-name">${escapeHtml(champion ? champion.name : "—")}</span>
        </div>
      </div>
      <div class="history-card-meta">
        <span>${h.totalGames || 0} lotes</span>
        <span>${h.totalDonors || 0} apoiadores</span>
        <span>${formatDuration(h.durationMs)}</span>
      </div>
    </button>
  `;
}

async function loadHistory() {
  let history = [];
  try {
    const data = await fetch(`/api/l/${LEILAO_ID}/recap/history`).then((r) => r.json());
    history = data.history || [];
  } catch (err) {
    console.error("Erro ao carregar histórico:", err.message);
  }

  const gridEl = document.getElementById("history-grid");
  const emptyEl = document.getElementById("history-list-empty");

  if (history.length === 0) {
    emptyEl.hidden = false;
    gridEl.innerHTML = "";
    return;
  }
  emptyEl.hidden = true;
  gridEl.innerHTML = history.map(historyCardHtml).join("");

  gridEl.querySelectorAll(".history-card").forEach((card) => {
    card.addEventListener("click", () => {
      const index = Number(card.dataset.index);
      const recap = history[index];
      if (!recap) return;
      const when = recap.archivedAt
        ? new Date(recap.archivedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
        : "";
      renderRecap(recap, when ? `round encerrado em ${when}` : "round anterior");
    });
  });
}

loadHistory();
