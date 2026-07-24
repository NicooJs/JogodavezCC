// Overlay de Browser Source pro OBS/Streamlabs: passivo, via socket. Fila
// evita que duas doações quase simultâneas sobreponham alertas.
const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/alerta/i)?.[1] || null;
if (!LEILAO_ID) throw new Error("LEILAO_ID ausente na URL");

const socket = io({ query: { leilaoId: LEILAO_ID } });

const cardEl = document.getElementById("alerta-card");
const iconEl = document.getElementById("alerta-icon");
const donorEl = document.getElementById("alerta-donor");
const actionEl = document.getElementById("alerta-action");
const gameEl = document.getElementById("alerta-game");
const amountEl = document.getElementById("alerta-amount");
const noteEl = document.getElementById("alerta-note");

const SHOW_MS = 4500;
const OUT_MS = 350;

const queue = [];
let showing = false;

function formatBRL(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

// Osciladores Web Audio puros, sem arquivo de áudio. Se o autoplay for
// bloqueado (falta habilitar "Control audio via OBS" na fonte), o alerta
// visual continua funcionando, só sem som.
function playChime(isRemove) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const notes = isRemove ? [520, 390] : [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch (err) {
    // sem suporte a Web Audio -- segue só com o alerta visual
  }
}

function showNext() {
  if (showing || queue.length === 0) return;
  showing = true;
  const item = queue.shift();

  const isRemove = item.type === "remove";
  iconEl.textContent = isRemove ? "−" : "+";
  iconEl.classList.toggle("is-remove", isRemove);
  donorEl.textContent = item.username || "Alguém";
  actionEl.textContent = isRemove ? "sabotou" : "apoiou";
  gameEl.textContent = item.game.name;
  amountEl.textContent = formatBRL(item.amount);
  if (item.note) {
    noteEl.textContent = `"${item.note}"`;
    noteEl.hidden = false;
  } else {
    noteEl.hidden = true;
  }

  cardEl.hidden = false;
  cardEl.classList.remove("is-out");
  cardEl.classList.add("is-in");
  playChime(isRemove);

  scheduleHide(item);
}

function startHideTimer(delayMs) {
  setTimeout(() => {
    cardEl.classList.remove("is-in");
    cardEl.classList.add("is-out");
    setTimeout(() => {
      cardEl.hidden = true;
      cardEl.classList.remove("is-out");
      showing = false;
      showNext();
    }, OUT_MS);
  }, delayMs);
}

// Sem voz escolhida (ou sem chave do Google TTS configurada no servidor),
// item.audioUrl nunca chega e o card some no tempo fixo de sempre. Com
// áudio, espera a fala terminar de verdade ("ended") em vez de estimar
// duração -- com timeouts de segurança pro autoplay bloqueado ou o áudio
// nunca carregar, pra nunca travar a fila de alertas.
function scheduleHide(item) {
  if (!item.audioUrl) {
    startHideTimer(SHOW_MS);
    return;
  }
  let settled = false;
  const finish = (delayMs) => {
    if (settled) return;
    settled = true;
    startHideTimer(delayMs);
  };
  const audio = new Audio(item.audioUrl);
  audio.addEventListener("ended", () => finish(700));
  audio.addEventListener("error", () => finish(SHOW_MS));
  setTimeout(() => finish(SHOW_MS), 12000);
  setTimeout(() => {
    audio.play().catch(() => finish(SHOW_MS));
  }, 450);
}

socket.on("update", ({ leaderboard, lastEvent }) => {
  document.documentElement.dataset.theme = leaderboard.theme || "ametista";

  if (!lastEvent || !lastEvent.game) return;
  if (lastEvent.type !== "add" && lastEvent.type !== "remove") return;

  queue.push(lastEvent);
  showNext();
});

// Evento separado do "update" normal -- ver POST /admin/test-alert. Só
// quem escuta isso (o overlay) reage; o board nunca recebe esse evento.
socket.on("test-alert", (lastEvent) => {
  queue.push(lastEvent);
  showNext();
});
