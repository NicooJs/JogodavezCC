const loggedOutEl = document.getElementById("hub-logged-out");
const shellEl = document.getElementById("hub-shell");
const greetingEl = document.getElementById("hub-greeting");
const gridEl = document.getElementById("hub-service-grid");

// cada item da sidebar troca o conteúdo da área principal (hub-main) --
// nada de modal/drawer aqui, view escolhida fica sempre visível junto com
// a sidebar, igual um app de configurações comum
const views = {
  home: document.getElementById("view-home"),
  perfil: document.getElementById("view-perfil"),
  config: document.getElementById("view-config"),
  historico: document.getElementById("view-historico"),
};
let activeView = "home";

// cada view tem seu próprio caminho (rotas espelhadas em server.js, todas
// servem o mesmo painel.html) pra um F5 manter o streamer na mesma tela
// em vez de sempre voltar pro Início
const VIEW_PATHS = { home: "/painel", perfil: "/painel/perfil", config: "/painel/config", historico: "/painel/historico" };
function viewForPath(pathname) {
  return Object.keys(VIEW_PATHS).find((name) => VIEW_PATHS[name] === pathname) || null;
}

// só troca o DOM + carrega a view, sem mexer no histórico -- usado tanto
// pela navegação normal (via showView) quanto por popstate (voltar/avançar)
function applyView(name) {
  if (!views[name]) return;
  activeView = name;
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
  mountSidebar();
  loadView(name);
}

function showView(name) {
  applyView(name);
  const path = VIEW_PATHS[name];
  if (path && location.pathname !== path) history.pushState({ view: name }, "", path);
}

function loadView(name) {
  if (name === "config") return ensureConfigView();
  if (name === "historico") return ensureHistoricoView();
  if (name === "perfil") return ensurePerfilView();
}

// mesma trava de antes (Config/Histórico exigem leilão) -- agora chamada
// como callback pelo React da sidebar em vez de listener direto no botão
function onSidebarNavigate(view) {
  if (!leilao && view !== "home" && view !== "perfil") {
    alert("Crie seu leilão primeiro pra acessar isso.");
    return;
  }
  showView(view);
}

async function onSidebarLogout() {
  const ok = confirm("Sair da conta?");
  if (!ok) return;
  await fetch("/api/session/logout", { method: "POST" }).catch(() => {});
  location.reload();
}

// sidebar é o único standalone que monta assim que a sessão carrega, não
// sob demanda (ver ensureConfigView/ensureHistoricoView/ensurePerfilView
// abaixo) -- fica visível o tempo todo, não escondida atrás de um clique.
// mount() de novo a cada troca de view só atualiza activeView (re-render
// comum, a raiz React não é recriada).
let sidebarPanelLoad = null;
async function mountSidebar() {
  try {
    if (!sidebarPanelLoad) sidebarPanelLoad = loadStandaloneEntry("/board-app/sidebar.html");
    await sidebarPanelLoad;
    window.JogodaVezSidebar.mount("sidebar-root", {
      activeView,
      avatarUrl: session && session.avatarUrl,
      onNavigate: onSidebarNavigate,
      onLogout: onSidebarLogout,
    });
  } catch (err) {
    // sem sidebar por enquanto, mas o resto do hub continua usável -- não
    // trava loadSession() por causa disso
  }
}

window.addEventListener("popstate", () => {
  applyView(viewForPath(location.pathname) || "home");
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Configurações e Histórico montam React de verdade (ver
// client/src/settings-main.jsx e historico-main.jsx), nunca o board/leilão
// inteiro. Cada bundle é buscado (fetch + extrai o <script> com hash já
// resolvido pelo Vite) só na primeira vez que a view é aberta -- depois
// mount() é só re-render, a raiz React persiste porque o container nunca
// sai do DOM, só fica hidden.
function loadStandaloneEntry(htmlPath) {
  return fetch(htmlPath)
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
}

const settingsRootEl = document.getElementById("settings-root");
let settingsPanelLoad = null;
let settingsMounted = false;

async function ensureConfigView() {
  if (settingsMounted) return;
  try {
    if (!settingsPanelLoad) settingsPanelLoad = loadStandaloneEntry("/board-app/settings.html");
    await settingsPanelLoad;
    window.JogodaVezSettingsPanel.mount("settings-root", leilao.id);
    settingsMounted = true;
  } catch (err) {
    settingsRootEl.innerHTML = `<p class="empty-state">Não deu pra carregar as configurações agora.</p>`;
  }
}

// Histórico -- junta o que antes eram duas telas (Ranking e Histórico,
// dados quase idênticos: os dois vinham de getPastAuctions(), só ordenados
// diferente) numa lista só de rounds encerrados, estilo histórico de
// partidas.
const historicoRootEl = document.getElementById("historico-root");
let historicoPanelLoad = null;
let historicoMounted = false;

async function ensureHistoricoView() {
  if (historicoMounted) return;
  try {
    if (!historicoPanelLoad) historicoPanelLoad = loadStandaloneEntry("/board-app/historico.html");
    await historicoPanelLoad;
    window.JogodaVezHistoricoPanel.mount("historico-root", leilao.id);
    historicoMounted = true;
  } catch (err) {
    historicoRootEl.innerHTML = `<p class="empty-state">Não deu pra carregar o histórico agora.</p>`;
  }
}

// Perfil -- reconstrução em andamento, seção por seção (ver plano). Só
// Visão geral tem conteúdo de verdade por enquanto, as outras 4 abas
// mostram um placeholder honesto dentro do próprio PerfilStandalone.
// Perfil é por CONTA, não por leilão -- mount() não recebe leilaoId.
const perfilRootEl = document.getElementById("perfil-root");
let perfilPanelLoad = null;
let perfilMounted = false;

async function ensurePerfilView() {
  if (perfilMounted) return;
  try {
    if (!perfilPanelLoad) perfilPanelLoad = loadStandaloneEntry("/board-app/perfil.html");
    await perfilPanelLoad;
    window.JogodaVezPerfilPanel.mount("perfil-root");
    perfilMounted = true;
  } catch (err) {
    perfilRootEl.innerHTML = `<p class="empty-state">Não deu pra carregar seu perfil agora.</p>`;
  }
}

const ICON_LEILAO = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="6" height="6" rx="1" /><rect x="11.5" y="4" width="6" height="6" rx="1" /><rect x="2.5" y="12" width="6" height="4" rx="1" /><rect x="11.5" y="12" width="6" height="4" rx="1" /></svg>`;
const ICON_REACTS = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" /><path d="M8.2 8.1l4 2.1-4 2.1V8.1z" fill="currentColor" stroke="none" /><path d="M6 17h8" /></svg>`;

let session = null;
let leilao = null; // { id, url, title, activeSystem, ... } ou null

async function loadSession() {
  session = await fetch("/api/session/me").then((r) => r.json()).catch(() => ({ loggedIn: false }));

  loggedOutEl.hidden = session.loggedIn;
  shellEl.hidden = !session.loggedIn;
  if (!session.loggedIn) {
    // leva o login de volta pra onde o streamer tentou entrar (ex: um F5
    // em /painel/perfil sem sessão), não sempre pro Início
    const loginLink = document.getElementById("hub-login-link");
    if (loginLink && viewForPath(location.pathname)) {
      loginLink.href = `/auth/twitch/start?returnTo=${encodeURIComponent(location.pathname)}`;
    }
    return;
  }

  greetingEl.textContent = `Olá, ${session.displayName || session.twitchLogin || ""}`;

  await loadLeilao();
  renderServices();

  // decide a view inicial pela URL (F5 mantém a página), mas Config/
  // Histórico exigem leilão -- sem um, cai pro Início silenciosamente
  // (sem o alert(), que é só pra clique explícito no meio da navegação)
  let initialView = viewForPath(location.pathname) || "home";
  if (!leilao && initialView !== "home" && initialView !== "perfil") {
    initialView = "home";
    history.replaceState({ view: initialView }, "", VIEW_PATHS[initialView]);
  }
  applyView(initialView);
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

loadSession();
