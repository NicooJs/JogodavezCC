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
const mpWarningLinkEl = document.getElementById("mp-warning-link");

const promptDialogOverlayEl = document.getElementById("prompt-dialog-overlay");
const confirmDialogOverlayEl = document.getElementById("confirm-dialog-overlay");

const settingsBodyEl = document.getElementById("settings-body");
const settingsTabPillEl = document.getElementById("settings-tab-pill");
const settingsTabButtons = [...document.querySelectorAll(".settings-tab")];
const settingsPanelGroups = {};
document.querySelectorAll(".settings-panel-group").forEach((el) => { settingsPanelGroups[el.dataset.tabPanel] = el; });

let settingsGames = [];
let settingsLeaderboard = null;

// ---- abas do painel (Geral/Aparência/Jogos/Avançado), com pílula
// deslizante -- ver .settings-tab-pill em settings.css ----

function positionPill(tabButton) {
  settingsTabPillEl.style.width = `${tabButton.offsetWidth}px`;
  settingsTabPillEl.style.transform = `translateX(${tabButton.offsetLeft}px)`;
}

// Reposiciona sem animar -- mesmo truque de bumpValue() em app.js
// (classList.remove + void offsetWidth + classList.add), adaptado de
// keyframe animation pra transition.
function snapPillTo(tabButton) {
  settingsTabPillEl.classList.add("no-transition");
  positionPill(tabButton);
  void settingsTabPillEl.offsetWidth;
  settingsTabPillEl.classList.remove("no-transition");
}

function activateSettingsTab(tabName, { instant = false } = {}) {
  settingsTabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  Object.entries(settingsPanelGroups).forEach(([name, el]) => { el.hidden = name !== tabName; });
  settingsBodyEl.scrollTop = 0; // sem isso, trocar de aba rolado pode mostrar a aba nova numa posição que nem existe nela
  const activeBtn = settingsTabButtons.find((b) => b.dataset.tab === tabName);
  if (activeBtn) instant ? snapPillTo(activeBtn) : positionPill(activeBtn);
}

settingsTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateSettingsTab(btn.dataset.tab));
});

window.addEventListener("resize", () => {
  if (settingsOverlayEl.hidden) return;
  const activeBtn = settingsTabButtons.find((b) => b.classList.contains("active"));
  if (activeBtn) snapPillTo(activeBtn); // só reposiciona, não é troca de aba
});

function openSettingsModal() {
  settingsOverlayEl.hidden = false;
  // #settings-overlay começa hidden -- elemento numa árvore display:none tem
  // offsetWidth/offsetLeft = 0 (não gera caixa de layout), então só dá pra
  // medir a pílula DEPOIS de tirar o hidden, não antes. Reseta sempre pra
  // "geral" ao abrir (não lembra a última aba usada) -- mesmo espírito de
  // openLotModal() em app.js, que sempre volta pros campos limpos.
  activateSettingsTab("geral", { instant: true });
  if (settingsLeaderboard) renderSettingsFromLeaderboard(settingsLeaderboard);
  loadSettingsHistory();
}

function closeSettingsModal() {
  settingsOverlayEl.hidden = true;
}

// Antes só checava getPassword() (sessionStorage) -- pra quem já é dono
// verificado da Twitch mas nunca digitou a senha nessa aba (ex: entrou
// direto no board e clicou logo em "configurações"), isso pedia senha à
// toa. Mesmo critério do botão "modo apresentador" em app.js: pergunta pro
// servidor se esse navegador já é o dono verificado antes de cair pro
// modal de senha.
async function requireLoginThenOpenSettings() {
  if (getPassword()) {
    openSettingsModal();
    return;
  }
  if (await isVerifiedOwner()) {
    setPresenterMode(true);
    openSettingsModal();
    return;
  }
  pendingAfterLogin = openSettingsModal;
  openPresenterLogin();
}

adminLinkEl.addEventListener("click", requireLoginThenOpenSettings);
mpWarningLinkEl.addEventListener("click", requireLoginThenOpenSettings);

settingsCloseEl.addEventListener("click", closeSettingsModal);
settingsOverlayEl.addEventListener("click", (e) => { if (e.target === settingsOverlayEl) closeSettingsModal(); });

// ---- diálogos genéricos (promptDialog/confirmDialog) no lugar de
// prompt()/confirm() nativos -- ver uso nos 5 pontos de chamada abaixo ----

let promptDialogResolve = null;
let confirmDialogResolve = null;

function settlePromptDialog(result) {
  promptDialogOverlayEl.hidden = true;
  const resolve = promptDialogResolve;
  promptDialogResolve = null;
  if (resolve) resolve(result);
}
function settleConfirmDialog(result) {
  confirmDialogOverlayEl.hidden = true;
  const resolve = confirmDialogResolve;
  confirmDialogResolve = null;
  if (resolve) resolve(result);
}

// Resolve null no cancelar (igual prompt() nativo) ou o valor cru do input
// no confirmar -- sem trim, nenhum dos pontos de chamada fazia trim antes,
// não é a hora de mudar esse comportamento.
function promptDialog({ title, label, initialValue = "", inputType = "text", confirmLabel = "Salvar" } = {}) {
  return new Promise((resolve) => {
    promptDialogResolve = resolve;
    document.getElementById("prompt-dialog-title").textContent = title;
    document.getElementById("prompt-dialog-label").textContent = label;
    const input = document.getElementById("prompt-dialog-input");
    input.type = inputType;
    input.value = initialValue;
    document.getElementById("prompt-dialog-confirm").textContent = confirmLabel;
    promptDialogOverlayEl.hidden = false;
    setTimeout(() => { input.focus(); input.select(); }, 40); // mesmo delay de openLotModal em app.js
  });
}

function confirmDialog({ title, message, confirmLabel = "Confirmar", danger = false } = {}) {
  return new Promise((resolve) => {
    confirmDialogResolve = resolve;
    document.getElementById("confirm-dialog-title").textContent = title;
    document.getElementById("confirm-dialog-message").textContent = message;
    const confirmBtn = document.getElementById("confirm-dialog-confirm");
    const cancelBtn = document.getElementById("confirm-dialog-cancel");
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle("primary", !danger);
    confirmBtn.classList.toggle("danger", danger);
    confirmDialogOverlayEl.hidden = false;
    // Foco no botão seguro por padrão em ação destrutiva -- Enter não
    // confirma sabotagem sem querer (reflexo de já ter apertado Enter no
    // confirm() nativo que isso substitui).
    setTimeout(() => (danger ? cancelBtn : confirmBtn).focus(), 40);
  });
}

document.getElementById("prompt-dialog-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("prompt-dialog-confirm").click(); }
});
document.getElementById("prompt-dialog-confirm").addEventListener("click", () => settlePromptDialog(document.getElementById("prompt-dialog-input").value));
document.getElementById("prompt-dialog-cancel").addEventListener("click", () => settlePromptDialog(null));
document.getElementById("prompt-dialog-close").addEventListener("click", () => settlePromptDialog(null));
promptDialogOverlayEl.addEventListener("click", (e) => { if (e.target === promptDialogOverlayEl) settlePromptDialog(null); });

document.getElementById("confirm-dialog-confirm").addEventListener("click", () => settleConfirmDialog(true));
document.getElementById("confirm-dialog-cancel").addEventListener("click", () => settleConfirmDialog(false));
document.getElementById("confirm-dialog-close").addEventListener("click", () => settleConfirmDialog(false));
confirmDialogOverlayEl.addEventListener("click", (e) => { if (e.target === confirmDialogOverlayEl) settleConfirmDialog(false); });

// Handler único de Escape, checando a camada mais alta primeiro -- um
// diálogo aberto POR CIMA do settings é o primeiro caso desse app com duas
// overlays simultâneas. Se cada uma tivesse seu próprio listener
// independente (padrão usado em todo o resto do app, ver app.js), um
// Escape fecharia as duas de uma vez no mesmo aperto.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!promptDialogOverlayEl.hidden) return settlePromptDialog(null);
  if (!confirmDialogOverlayEl.hidden) return settleConfirmDialog(false);
  if (!settingsOverlayEl.hidden) closeSettingsModal();
});

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
  renderMpState(leaderboard.mpDisconnected);
  renderSettingsThemePicker(leaderboard.theme);
  const bgInput = document.getElementById("bg-image-url");
  if (document.activeElement !== bgInput) bgInput.value = leaderboard.backgroundImageUrl || "";
  const qualifyInput = document.getElementById("qualify-count-input");
  if (document.activeElement !== qualifyInput) qualifyInput.value = leaderboard.qualifyCount || 3;
  renderGamesTable();
  renderMergeOptions();
}

function renderOpenState(open) {
  const badge = document.getElementById("open-state");
  badge.textContent = open ? "aberto" : "encerrado";
  badge.className = "badge" + (open ? "" : " closed");
  document.getElementById("toggle-open").textContent = open ? "Encerrar leilão" : "Reabrir leilão";
}

function renderMpState(disconnected) {
  const text = disconnected ? "desconectado — reconecte pra continuar recebendo" : "conectado";
  const badgeClass = "badge" + (disconnected ? " closed" : "");

  const badge = document.getElementById("mp-state");
  badge.textContent = text;
  badge.className = badgeClass;

  const advancedBadge = document.getElementById("mp-advanced-state");
  advancedBadge.textContent = text;
  advancedBadge.className = badgeClass;

  document.getElementById("mp-reconnect-link").href = `/auth/mercadopago/start?returnTo=/l/${LEILAO_ID}`;
}

function renderSettingsThemePicker(theme) {
  document.querySelectorAll("#settings-theme-picker .theme-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === (theme || "ametista"));
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
  if (isOpen) {
    const ok = await confirmDialog({ title: "Encerrar leilão", message: "Encerrar o leilão agora? Ele só reabre quando você reabrir manualmente.", confirmLabel: "Encerrar", danger: true });
    if (!ok) return;
  }
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

document.getElementById("bg-image-upload").addEventListener("click", async () => {
  const fileInput = document.getElementById("bg-image-file");
  const statusEl = document.getElementById("bg-image-upload-status");
  const file = fileInput.files[0];
  if (!file) return alert("Escolha um arquivo de imagem primeiro");

  const formData = new FormData();
  formData.append("image", file);
  statusEl.textContent = "Enviando…";
  try {
    await presenterFetch("/admin/background-image-upload", { method: "POST", body: formData });
    statusEl.textContent = "Enviado!";
    fileInput.value = "";
    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  } catch (err) {
    statusEl.textContent = "Erro: " + err.message;
  }
});

document.getElementById("qualify-count-save").addEventListener("click", async () => {
  const count = Number(document.getElementById("qualify-count-input").value);
  try {
    await presenterFetch("/admin/qualify-count", { method: "POST", body: JSON.stringify({ count }) });
  } catch (err) {
    alert(err.message);
  }
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
        <button class="btn-mini" data-act="plus">+10</button>
        <button class="btn-mini" data-act="minus">-10</button>
        <button class="btn-mini" data-act="set">definir valor</button>
        <button class="btn-mini" data-act="rename">renomear</button>
        <button class="btn-mini danger" data-act="delete">excluir</button>
      </td>
    `;
    tr.querySelector('[data-act="plus"]').addEventListener("click", () =>
      presenterFetch("/admin/adjust", { method: "POST", body: JSON.stringify({ key: game.key, deltaAmount: 10 }) })
    );
    tr.querySelector('[data-act="minus"]').addEventListener("click", () =>
      presenterFetch("/admin/adjust", { method: "POST", body: JSON.stringify({ key: game.key, deltaAmount: -10 }) })
    );
    tr.querySelector('[data-act="set"]').addEventListener("click", async () => {
      const value = await promptDialog({ title: "Definir valor total", label: `Novo valor total para "${game.name}" (R$)`, initialValue: game.total.toFixed(2), inputType: "number", confirmLabel: "Salvar" });
      if (value === null) return;
      presenterFetch("/admin/set-total", { method: "POST", body: JSON.stringify({ key: game.key, total: value }) });
    });
    tr.querySelector('[data-act="rename"]').addEventListener("click", async () => {
      const value = await promptDialog({ title: "Renomear jogo", label: "Novo nome", initialValue: game.name, confirmLabel: "Salvar" });
      if (value === null) return;
      presenterFetch("/admin/rename", { method: "POST", body: JSON.stringify({ key: game.key, newName: value }) });
    });
    tr.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Excluir jogo", message: `Excluir "${game.name}"?`, confirmLabel: "Excluir", danger: true });
      if (!ok) return;
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

document.getElementById("reset-btn").addEventListener("click", async () => {
  const ok = await confirmDialog({ title: "Zerar leilão", message: "Isso apaga TODOS os jogos e o histórico. Tem certeza?", confirmLabel: "Zerar leilão", danger: true });
  if (!ok) return;
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
        <td>${h.totalRaised === null ? "oculto" : formatBRL(h.totalRaised || 0)}</td>
        <td>${h.totalGames || 0}</td>
        <td>${escapeHtml(champion)}</td>
        <td><a href="/l/${LEILAO_ID}?recap=${index}" target="_blank">Ver recap →</a></td>
      </tr>
    `;
  }).join("");
}
