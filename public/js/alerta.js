// Overlay de alerta pra Browser Source do OBS/Streamlabs -- 100% passivo
// (sem clique, sem formulário): só escuta o socket que já existe e mostra
// um card por doação de verdade. Fila simples pra não sobrepor dois
// alertas se duas doações chegarem quase juntas.
const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/alerta/i)?.[1] || null;
if (!LEILAO_ID) throw new Error("LEILAO_ID ausente na URL");

const socket = io({ query: { leilaoId: LEILAO_ID } });

const cardEl = document.getElementById("alerta-card");
const iconEl = document.getElementById("alerta-icon");
const donorEl = document.getElementById("alerta-donor");
const actionEl = document.getElementById("alerta-action");
const gameEl = document.getElementById("alerta-game");
const amountEl = document.getElementById("alerta-amount");

const SHOW_MS = 4500;
const OUT_MS = 350;

const queue = [];
let showing = false;

function formatBRL(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

// Osciladores puros via Web Audio -- sem baixar/servir nenhum arquivo de
// áudio novo. Navegador/OBS pode bloquear autoplay de som até liberar
// "Control audio via OBS" na fonte -- nesse caso o alerta visual continua
// funcionando normalmente, só sem o som.
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

  cardEl.hidden = false;
  cardEl.classList.remove("is-out");
  cardEl.classList.add("is-in");
  playChime(isRemove);

  setTimeout(() => {
    cardEl.classList.remove("is-in");
    cardEl.classList.add("is-out");
    setTimeout(() => {
      cardEl.hidden = true;
      cardEl.classList.remove("is-out");
      showing = false;
      showNext();
    }, OUT_MS);
  }, SHOW_MS);
}

socket.on("update", ({ leaderboard, lastEvent }) => {
  document.documentElement.dataset.theme = leaderboard.theme || "ametista";

  if (!lastEvent || !lastEvent.game) return;
  if (lastEvent.type !== "add" && lastEvent.type !== "remove") return;

  queue.push(lastEvent);
  showNext();
});
