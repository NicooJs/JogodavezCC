// Configurações — antes era a página separada /l/:id/admin (public/admin.html),
// que ainda existe mas não é mais linkada daqui: abrir uma aba nova pra mexer
// no leilão no meio da live era o oposto do "modo apresentador" (ver
// CLAUDE.md). Esse arquivo é carregado depois de app.js e reaproveita as
// mesmas globais dele (LEILAO_ID, presenterFetch, getPassword,
// openPresenterLogin, formatBRL, escapeHtml) — scripts sem type="module"
// compartilham o mesmo escopo global.

const settingsOverlayEl = document.getElementById("settings-overlay");
const settingsCloseEl = document.getElementById("settings-close");
const adminLinkEl = document.getElementById("admin-link");
const webhookWarningLinkEl = document.getElementById("webhook-warning-link");

let settingsGames = [];
let settingsLeaderboard = null;

function openSettingsModal() {
  settingsOverlayEl.hidden = false;
  if (settingsLeaderboard) renderSettingsFromLeaderboard(settingsLeaderboard);
  loadSettingsHistory();
}

function closeSettingsModal() {
  settingsOverlayEl.hidden = true;
}

function requireLoginThenOpenSettings() {
  if (getPassword()) {
    openSettingsModal();
    return;
  }
  pendingAfterLogin = openSettingsModal;
  openPresenterLogin();
}

adminLinkEl.addEventListener("click", requireLoginThenOpenSettings);
webhookWarningLinkEl.addEventListener("click", requireLoginThenOpenSettings);

settingsCloseEl.addEventListener("click", closeSettingsModal);
settingsOverlayEl.addEventListener("click", (e) => { if (e.target === settingsOverlayEl) closeSettingsModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !settingsOverlayEl.hidden) closeSettingsModal(); });

// socket já existe (declarado em app.js) — mais um listener no mesmo evento
// não atrapalha o listener original, só mantém esse arquivo com os dados
// mais recentes pra quando o modal abrir.
socket.on("update", ({ leaderboard }) => {
  settingsLeaderboard = leaderboard;
  settingsGames = leaderboard.items;
  if (!settingsOverlayEl.hidden) renderSettingsFromLeaderboard(leaderboard);
});

function renderSettingsFromLeaderboard(leaderboard) {
  const titleInput = document.getElementById("title-input");
  if (document.activeElement !== titleInput) titleInput.value = leaderboard.title;
  renderOpenState(leaderboard.open);
  renderWebhookState(leaderboard.webhookStale, leaderboard.webhookSignatureIssue);
  renderSettingsThemePicker(leaderboard.theme);
  const bgInput = document.getElementById("bg-image-url");
  if (document.activeElement !== bgInput) bgInput.value = leaderboard.backgroundImageUrl || "";
  renderGamesTable();
  renderMergeOptions();
}

function renderOpenState(open) {
  const badge = document.getElementById("open-state");
  badge.textContent = open ? "aberto" : "encerrado";
  badge.className = "badge" + (open ? "" : " closed");
  document.getElementById("toggle-open").textContent = open ? "Encerrar leilão" : "Reabrir leilão";
}

function renderWebhookState(stale, signatureIssue) {
  const badge = document.getElementById("webhook-state");
  if (signatureIssue) {
    badge.textContent = "assinatura errada — URL provavelmente incompleta";
  } else if (stale) {
    badge.textContent = "sem contato há 30+ min (leilão aberto) — pode estar desvinculado";
  } else {
    badge.textContent = "vinculado";
  }
  badge.className = "badge" + (stale || signatureIssue ? " closed" : "");
}

function renderSettingsThemePicker(theme) {
  document.querySelectorAll("#settings-theme-picker .theme-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === (theme || "nebulosa"));
  });
}

document.querySelectorAll("#settings-theme-picker .theme-swatch").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await presenterFetch("/admin/theme", { method: "POST", body: JSON.stringify({ theme: btn.dataset.theme }) });
      renderSettingsThemePicker(btn.dataset.theme);
    } catch (err) {
      alert(err.message);
    }
  });
});

document.getElementById("save-title").addEventListener("click", async () => {
  const title = document.getElementById("title-input").value.trim();
  await presenterFetch("/admin/title", { method: "POST", body: JSON.stringify({ title }) });
});

document.getElementById("toggle-open").addEventListener("click", async () => {
  const isOpen = document.getElementById("open-state").textContent === "aberto";
  if (isOpen && !confirm("Encerrar o leilão agora? Ele só reabre quando você reabrir manualmente.")) return;
  await presenterFetch("/admin/toggle-open", { method: "POST", body: JSON.stringify({ open: !isOpen }) });
});

document.getElementById("bg-image-save").addEventListener("click", async () => {
  const url = document.getElementById("bg-image-url").value.trim();
  try {
    await presenterFetch("/admin/background-image", { method: "POST", body: JSON.stringify({ url }) });
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("bg-image-clear").addEventListener("click", async () => {
  document.getElementById("bg-image-url").value = "";
  await presenterFetch("/admin/background-image", { method: "POST", body: JSON.stringify({ url: "" }) });
});

document.getElementById("manual-submit").addEventListener("click", async () => {
  const name = document.getElementById("manual-name").value.trim();
  const amount = document.getElementById("manual-amount").value;
  const action = document.getElementById("manual-action").value;
  const username = document.getElementById("manual-username").value.trim();
  if (!name || !amount) return alert("Preencha nome e valor");
  try {
    await presenterFetch("/admin/manual-entry", {
      method: "POST",
      body: JSON.stringify({ name, amount, action, username }),
    });
    document.getElementById("manual-name").value = "";
    document.getElementById("manual-amount").value = "";
    document.getElementById("manual-username").value = "";
  } catch (err) {
    alert(err.message);
  }
});

function renderGamesTable() {
  const body = document.getElementById("games-body");
  body.innerHTML = "";
  settingsGames.forEach((game) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${game.rank}</td>
      <td>${escapeHtml(game.name)}</td>
      <td>${formatBRL(game.total)}</td>
      <td class="row-actions">
        <button class="btn" data-act="plus">+10</button>
        <button class="btn" data-act="minus">-10</button>
        <button class="btn" data-act="set">definir valor</button>
        <button class="btn" data-act="rename">renomear</button>
        <button class="btn danger" data-act="delete">excluir</button>
      </td>
    `;
    tr.querySelector('[data-act="plus"]').addEventListener("click", () =>
      presenterFetch("/admin/adjust", { method: "POST", body: JSON.stringify({ key: game.key, deltaAmount: 10 }) })
    );
    tr.querySelector('[data-act="minus"]').addEventListener("click", () =>
      presenterFetch("/admin/adjust", { method: "POST", body: JSON.stringify({ key: game.key, deltaAmount: -10 }) })
    );
    tr.querySelector('[data-act="set"]').addEventListener("click", () => {
      const value = prompt(`Novo valor total para "${game.name}" (R$):`, game.total.toFixed(2));
      if (value === null) return;
      presenterFetch("/admin/set-total", { method: "POST", body: JSON.stringify({ key: game.key, total: value }) });
    });
    tr.querySelector('[data-act="rename"]').addEventListener("click", () => {
      const value = prompt("Novo nome:", game.name);
      if (value === null) return;
      presenterFetch("/admin/rename", { method: "POST", body: JSON.stringify({ key: game.key, newName: value }) });
    });
    tr.querySelector('[data-act="delete"]').addEventListener("click", () => {
      if (!confirm(`Excluir "${game.name}"?`)) return;
      presenterFetch(`/admin/game/${encodeURIComponent(game.key)}`, { method: "DELETE" });
    });
    body.appendChild(tr);
  });
}

function renderMergeOptions() {
  const fromSel = document.getElementById("merge-from");
  const toSel = document.getElementById("merge-to");
  const options = settingsGames
    .map((g) => `<option value="${g.key}">${escapeHtml(g.name)} (${formatBRL(g.total)})</option>`)
    .join("");
  fromSel.innerHTML = options;
  toSel.innerHTML = options;
}

document.getElementById("merge-submit").addEventListener("click", async () => {
  const fromKey = document.getElementById("merge-from").value;
  const toKey = document.getElementById("merge-to").value;
  if (!fromKey || !toKey || fromKey === toKey) return alert("Escolha dois jogos diferentes");
  try {
    await presenterFetch("/admin/merge", { method: "POST", body: JSON.stringify({ fromKey, toKey }) });
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("relink-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const clientId = document.getElementById("relink-client-id").value.trim();
  const clientSecret = document.getElementById("relink-client-secret").value.trim();
  const resultEl = document.getElementById("relink-result");
  resultEl.textContent = "";
  if (!clientId || !clientSecret) return alert("Preencha Client ID e Client Secret");
  try {
    await presenterFetch("/admin/relink-webhook", {
      method: "POST",
      body: JSON.stringify({ clientId, clientSecret }),
    });
    resultEl.textContent = "Webhook revinculado com sucesso.";
    document.getElementById("relink-client-secret").value = "";
  } catch (err) {
    resultEl.textContent = "Erro: " + err.message;
  }
});

document.getElementById("reset-btn").addEventListener("click", async () => {
  if (!confirm("Isso apaga TODOS os jogos e o histórico. Tem certeza?")) return;
  await presenterFetch("/admin/reset", { method: "POST" });
  loadSettingsHistory();
});

// Histórico de rounds já zerados — carregado sob demanda (não vem pelo
// socket) toda vez que o modal abre, igual o admin.html fazia.
async function loadSettingsHistory() {
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/recap/history`);
    const data = await res.json();
    renderSettingsHistory(data.history || []);
  } catch (err) {
    console.error("Erro ao carregar histórico:", err.message);
  }
}

function renderSettingsHistory(history) {
  const emptyEl = document.getElementById("settings-history-empty");
  const tableEl = document.getElementById("history-table");
  if (history.length === 0) {
    emptyEl.style.display = "block";
    tableEl.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";
  tableEl.style.display = "table";

  const body = document.getElementById("history-body");
  body.innerHTML = history.map((h, index) => {
    const when = h.archivedAt ? new Date(h.archivedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
    const champion = h.topGames && h.topGames[0] ? h.topGames[0].name : "—";
    const inProgressTag = h.openRound ? ` <span class="badge">em andamento</span>` : "";
    return `
      <tr>
        <td>${when}${inProgressTag}</td>
        <td>${formatBRL(h.totalRaised || 0)}</td>
        <td>${h.totalGames || 0}</td>
        <td>${escapeHtml(champion)}</td>
        <td><a href="/l/${LEILAO_ID}?recap=${index}" target="_blank">Ver recap →</a></td>
      </tr>
    `;
  }).join("");
}
