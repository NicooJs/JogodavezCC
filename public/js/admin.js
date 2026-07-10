// Painel avançado é servido em /l/<id>/admin — mesma convenção do board.
const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/admin/i)?.[1] || null;

const loginScreen = document.getElementById("login-screen");
const adminScreen = document.getElementById("admin-screen");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

if (!LEILAO_ID) {
  loginScreen.innerHTML = '<header class="top"><h1>Link inválido</h1></header><div class="panel"><p>Esse link não aponta pra nenhum leilão. Volte pra <a href="/">criar ou achar o seu</a>.</p></div>';
}

function getPassword() {
  return sessionStorage.getItem(`admin:${LEILAO_ID}`) || "";
}

async function adminFetch(path, options = {}) {
  const res = await fetch(`/api/l/${LEILAO_ID}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": getPassword(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function tryLogin(password) {
  const res = await fetch(`/api/l/${LEILAO_ID}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

if (LEILAO_ID) {
  loginBtn.addEventListener("click", async () => {
    const password = passwordInput.value;
    loginError.textContent = "";
    const ok = await tryLogin(password);
    if (!ok) {
      loginError.textContent = "Senha incorreta";
      return;
    }
    sessionStorage.setItem(`admin:${LEILAO_ID}`, password);
    showAdmin();
  });

  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });

  if (getPassword()) {
    tryLogin(getPassword()).then((ok) => { if (ok) showAdmin(); });
  }
}

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function showAdmin() {
  loginScreen.style.display = "none";
  adminScreen.style.display = "block";
  initAdmin();
}

// ---------------- admin screen logic ----------------

let socket;
let currentGames = [];
let adminInitialized = false;

function initAdmin() {
  if (adminInitialized) return;
  adminInitialized = true;

  socket = io({ query: { leilaoId: LEILAO_ID } });
  socket.on("update", ({ leaderboard }) => {
    currentGames = leaderboard.items;
    document.getElementById("title-input").value = leaderboard.title;
    renderOpenState(leaderboard.open);
    renderWebhookState(leaderboard.webhookSignatureIssue);
    renderTable();
    renderMergeOptions();
  });

  document.getElementById("save-title").addEventListener("click", async () => {
    const title = document.getElementById("title-input").value.trim();
    await adminFetch("/admin/title", { method: "POST", body: JSON.stringify({ title }) });
  });

  document.getElementById("toggle-open").addEventListener("click", async () => {
    const isOpen = document.getElementById("open-state").textContent === "aberto";
    if (isOpen && !confirm("Encerrar o leilão agora? Ele só reabre quando você reabrir manualmente.")) return;
    await adminFetch("/admin/toggle-open", { method: "POST", body: JSON.stringify({ open: !isOpen }) });
  });

  document.getElementById("manual-submit").addEventListener("click", async () => {
    const name = document.getElementById("manual-name").value.trim();
    const amount = document.getElementById("manual-amount").value;
    const action = document.getElementById("manual-action").value;
    const username = document.getElementById("manual-username").value.trim();
    if (!name || !amount) return alert("Preencha nome e valor");
    try {
      await adminFetch("/admin/manual-entry", {
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

  document.getElementById("merge-submit").addEventListener("click", async () => {
    const fromKey = document.getElementById("merge-from").value;
    const toKey = document.getElementById("merge-to").value;
    if (!fromKey || !toKey || fromKey === toKey) return alert("Escolha dois jogos diferentes");
    try {
      await adminFetch("/admin/merge", { method: "POST", body: JSON.stringify({ fromKey, toKey }) });
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("reset-btn").addEventListener("click", async () => {
    if (!confirm("Isso apaga TODOS os jogos e o histórico. Tem certeza?")) return;
    await adminFetch("/admin/reset", { method: "POST" });
  });

  document.getElementById("relink-submit").addEventListener("click", async () => {
    const clientId = document.getElementById("relink-client-id").value.trim();
    const clientSecret = document.getElementById("relink-client-secret").value.trim();
    const resultEl = document.getElementById("relink-result");
    resultEl.textContent = "";
    if (!clientId || !clientSecret) return alert("Preencha Client ID e Client Secret");
    try {
      await adminFetch("/admin/relink-webhook", {
        method: "POST",
        body: JSON.stringify({ clientId, clientSecret }),
      });
      resultEl.textContent = "Webhook revinculado com sucesso.";
      document.getElementById("relink-client-secret").value = "";
    } catch (err) {
      resultEl.textContent = "Erro: " + err.message;
    }
  });
}

function renderOpenState(open) {
  const badge = document.getElementById("open-state");
  badge.textContent = open ? "aberto" : "encerrado";
  badge.className = "badge" + (open ? "" : " closed");
  document.getElementById("toggle-open").textContent = open ? "Encerrar leilão" : "Reabrir leilão";
}

function renderWebhookState(signatureIssue) {
  const badge = document.getElementById("webhook-state");
  if (signatureIssue) {
    badge.textContent = "assinatura errada — URL provavelmente incompleta";
  } else {
    badge.textContent = "vinculado";
  }
  badge.className = "badge" + (signatureIssue ? " closed" : "");
}

function renderTable() {
  const body = document.getElementById("games-body");
  body.innerHTML = "";
  currentGames.forEach((game) => {
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
      adminFetch("/admin/adjust", { method: "POST", body: JSON.stringify({ key: game.key, deltaAmount: 10 }) })
    );
    tr.querySelector('[data-act="minus"]').addEventListener("click", () =>
      adminFetch("/admin/adjust", { method: "POST", body: JSON.stringify({ key: game.key, deltaAmount: -10 }) })
    );
    tr.querySelector('[data-act="set"]').addEventListener("click", () => {
      const value = prompt(`Novo valor total para "${game.name}" (R$):`, game.total.toFixed(2));
      if (value === null) return;
      adminFetch("/admin/set-total", { method: "POST", body: JSON.stringify({ key: game.key, total: value }) });
    });
    tr.querySelector('[data-act="rename"]').addEventListener("click", () => {
      const value = prompt("Novo nome:", game.name);
      if (value === null) return;
      adminFetch("/admin/rename", { method: "POST", body: JSON.stringify({ key: game.key, newName: value }) });
    });
    tr.querySelector('[data-act="delete"]').addEventListener("click", () => {
      if (!confirm(`Excluir "${game.name}"?`)) return;
      adminFetch(`/admin/game/${encodeURIComponent(game.key)}`, { method: "DELETE" });
    });
    body.appendChild(tr);
  });
}

function renderMergeOptions() {
  const fromSel = document.getElementById("merge-from");
  const toSel = document.getElementById("merge-to");
  const options = currentGames
    .map((g) => `<option value="${g.key}">${escapeHtml(g.name)} (${formatBRL(g.total)})</option>`)
    .join("");
  fromSel.innerHTML = options;
  toSel.innerHTML = options;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
