const loggedOutEl = document.getElementById("hub-logged-out");
const shellEl = document.getElementById("hub-shell");
const avatarEl = document.getElementById("hub-avatar");
const greetingEl = document.getElementById("hub-greeting");
const gridEl = document.getElementById("hub-service-grid");

const drawerOverlayEl = document.getElementById("hub-drawer-overlay");
const drawerEl = document.getElementById("hub-drawer");
const drawerTitleEl = document.getElementById("hub-drawer-title");
const drawerBodyEl = document.getElementById("hub-drawer-body");

function openDrawer(title, { html, iframeSrc, wide } = {}) {
  drawerTitleEl.textContent = title;
  drawerEl.classList.toggle("is-wide", !!wide);
  if (iframeSrc) {
    // ainda usado só pelo Perfil por enquanto (reconstrução própria vem
    // numa rodada separada) -- Configurações já não passa mais por aqui
    drawerBodyEl.className = "side-drawer-body is-flush";
    drawerBodyEl.innerHTML = `<iframe class="side-drawer-frame" src="${escapeHtml(iframeSrc)}" title="${escapeHtml(title)}"></iframe>`;
  } else {
    drawerBodyEl.className = "side-drawer-body";
    drawerBodyEl.innerHTML = html || "";
  }
  drawerOverlayEl.hidden = false;
}
function closeDrawer() {
  drawerOverlayEl.hidden = true;
  drawerBodyEl.innerHTML = "";
}
document.getElementById("hub-drawer-close").addEventListener("click", closeDrawer);
drawerOverlayEl.addEventListener("click", (e) => { if (e.target === drawerOverlayEl) closeDrawer(); });

// drawer próprio de Configurações -- monta um React de verdade (ver
// client/src/settings-main.jsx), nunca o board/leilão. O bundle só é
// buscado na primeira abertura; depois disso mount() é só re-render.
const settingsDrawerOverlayEl = document.getElementById("settings-drawer-overlay");
const settingsRootEl = document.getElementById("settings-root");
let settingsPanelLoad = null;

function loadSettingsPanel() {
  if (settingsPanelLoad) return settingsPanelLoad;
  settingsPanelLoad = fetch("/board-app/settings.html")
    .then((res) => res.text())
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll('link[rel="modulepreload"]').forEach((link) => {
        const l = document.createElement("link");
        l.rel = "modulepreload";
        l.href = link.getAttribute("href");
        document.head.appendChild(l);
      });
      const entryScript = doc.querySelector('script[type="module"]');
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.type = "module";
        s.src = entryScript.getAttribute("src");
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
      });
    });
  return settingsPanelLoad;
}

async function openSettingsDrawer() {
  settingsDrawerOverlayEl.hidden = false;
  try {
    await loadSettingsPanel();
    window.JogodaVezSettingsPanel.mount("settings-root", leilao.id);
  } catch (err) {
    settingsRootEl.innerHTML = `<p class="empty-state">Não deu pra carregar as configurações agora.</p>`;
  }
}
function closeSettingsDrawer() {
  settingsDrawerOverlayEl.hidden = true;
}
document.getElementById("settings-drawer-close").addEventListener("click", closeSettingsDrawer);
settingsDrawerOverlayEl.addEventListener("click", (e) => { if (e.target === settingsDrawerOverlayEl) closeSettingsDrawer(); });

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!settingsDrawerOverlayEl.hidden) return closeSettingsDrawer();
  if (!drawerOverlayEl.hidden) return closeDrawer();
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const ICON_LEILAO = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="6" height="6" rx="1" /><rect x="11.5" y="4" width="6" height="6" rx="1" /><rect x="2.5" y="12" width="6" height="4" rx="1" /><rect x="11.5" y="12" width="6" height="4" rx="1" /></svg>`;
const ICON_REACTS = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" /><path d="M8.2 8.1l4 2.1-4 2.1V8.1z" fill="currentColor" stroke="none" /><path d="M6 17h8" /></svg>`;

let session = null;
let leilao = null; // { id, url, title, activeSystem, ... } ou null

async function loadSession() {
  session = await fetch("/api/session/me").then((r) => r.json()).catch(() => ({ loggedIn: false }));

  loggedOutEl.hidden = session.loggedIn;
  shellEl.hidden = !session.loggedIn;
  if (!session.loggedIn) return;

  avatarEl.src = session.avatarUrl || "";
  greetingEl.textContent = `Olá, ${session.displayName || session.twitchLogin || ""}`;

  await loadLeilao();
  renderServices();
}

async function loadLeilao() {
  const res = await fetch("/api/meus-leiloes");
  if (!res.ok) return;
  const { leiloes } = await res.json();
  leilao = leiloes && leiloes.length ? leiloes[0] : null;
}

function renderServices() {
  const leilaoHref = leilao ? leilao.url : "/";
  const reactsHref = leilao ? leilao.url : "/?sistema=reacts";

  gridEl.innerHTML = `
    <a class="hub-service-card" href="${escapeHtml(leilaoHref)}">
      <div class="hub-service-art tone-leilao">
        <span class="hub-service-art-icon">${ICON_LEILAO}</span>
      </div>
      <div class="hub-service-body">
        <p class="hub-service-name">Leilão</p>
        <p class="hub-service-desc">${leilao ? "Continuar administrando" : "Ainda não criado -- criar agora"}</p>
      </div>
    </a>
    <a class="hub-service-card" href="${escapeHtml(reactsHref)}" id="hub-card-reacts">
      <div class="hub-service-art tone-reacts">
        <span class="hub-service-art-icon">${ICON_REACTS}</span>
      </div>
      <div class="hub-service-body">
        <p class="hub-service-name">Reacts</p>
        <p class="hub-service-desc">${leilao ? "Continuar administrando" : "Ainda não criado -- criar agora"}</p>
      </div>
    </a>
    <div class="hub-soon-card">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12M4 10h12" /></svg>
      Mais ferramentas em breve
    </div>
  `;

  if (leilao) {
    document.getElementById("hub-card-reacts").addEventListener("click", (e) => {
      e.preventDefault();
      goToReacts();
    });
  }
}

async function goToReacts() {
  try {
    await fetch(`/api/l/${leilao.id}/admin/active-system`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: "reacts" }),
    });
  } catch (err) {
    // segue pro board mesmo assim -- o streamer troca o modo por lá se essa chamada falhar
  }
  location.href = leilao.url;
}

avatarEl.addEventListener("click", async () => {
  const ok = confirm("Sair da conta?");
  if (!ok) return;
  await fetch("/api/session/logout", { method: "POST" }).catch(() => {});
  location.reload();
});

document.getElementById("hub-nav-perfil").addEventListener("click", () => {
  openDrawer("Perfil", { iframeSrc: "/perfil", wide: true });
});

document.getElementById("hub-nav-config").addEventListener("click", () => {
  if (!leilao) {
    alert("Crie seu leilão primeiro pra acessar as configurações.");
    return;
  }
  openSettingsDrawer();
});

document.getElementById("hub-nav-ranking").addEventListener("click", async () => {
  if (!leilao) {
    alert("Crie seu leilão primeiro pra ter ranking.");
    return;
  }
  openDrawer("Seus melhores leilões", { html: `<p class="hub-modal-loading">Carregando...</p>` });
  try {
    const res = await fetch(`/api/l/${leilao.id}/ranking`);
    const { ranking } = await res.json();
    if (!ranking || !ranking.length) {
      drawerBodyEl.innerHTML = `<p class="empty-state">Nenhum round arrecadou nada ainda.</p>`;
      return;
    }
    drawerBodyEl.innerHTML = `
      <p class="hub-drawer-hint">Seus rounds, do que mais arrecadou pro que menos arrecadou -- não é uma disputa com outros streamers.</p>
      <ul class="hub-modal-list">${ranking.map((r) => `
        <li>
          <span class="hub-modal-list-rank">${String(r.rank).padStart(2, "0")}</span>
          <span class="hub-modal-list-name">${escapeHtml(r.title)}${r.openRound ? " <em>(em andamento)</em>" : ""}</span>
          <span class="hub-modal-list-value">R$ ${Math.round(r.totalRaised || 0).toLocaleString("pt-BR")}</span>
        </li>
      `).join("")}</ul>`;
  } catch (err) {
    drawerBodyEl.innerHTML = `<p class="empty-state">Não deu pra carregar o ranking agora.</p>`;
  }
});

document.getElementById("hub-nav-historico").addEventListener("click", async () => {
  if (!leilao) {
    alert("Crie seu leilão primeiro pra ter histórico.");
    return;
  }
  openDrawer("Histórico do leilão", { html: `<p class="hub-modal-loading">Carregando...</p>` });
  try {
    const res = await fetch(`/api/l/${leilao.id}/recap/history`);
    const { history } = await res.json();
    if (!history || !history.length) {
      drawerBodyEl.innerHTML = `<p class="empty-state">Nenhum leilão encerrado ainda.</p>`;
      return;
    }
    drawerBodyEl.innerHTML = `<ul class="hub-modal-list">${history.map((r, i) => `
      <li>
        <span class="hub-modal-list-rank">${String(history.length - i).padStart(2, "0")}</span>
        <span class="hub-modal-list-name">${escapeHtml(r.title || "Leilão")}${r.openRound ? " <em>(em andamento)</em>" : ""}</span>
        <span class="hub-modal-list-value">R$ ${Math.round(r.totalRaised || 0).toLocaleString("pt-BR")}</span>
      </li>
    `).join("")}</ul>`;
  } catch (err) {
    drawerBodyEl.innerHTML = `<p class="empty-state">Não deu pra carregar o histórico agora.</p>`;
  }
});

loadSession();
