const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/alerta/i)?.[1] || null;
if (!LEILAO_ID) throw new Error("LEILAO_ID ausente na URL");

const socket = io({ query: { leilaoId: LEILAO_ID } });

const cardEl = document.getElementById("alerta-card");
const comboEl = document.getElementById("alerta-combo");
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

// escolha de som é da conta do streamer (Perfil -> Alerta), não do leilão --
// esse mapa só traduz o nome escolhido pros parâmetros de síntese
const CHIME_PRESETS = {
  classic: { wave: "sine", apoio: [660, 880], sabota: [520, 390] },
  arcade: { wave: "square", apoio: [523, 659, 784], sabota: [400, 300] },
  chill: { wave: "triangle", apoio: [440, 554], sabota: [370, 300] },
  bell: { wave: "sine", apoio: [880, 1108], sabota: [440, 330] },
};
let currentChime = "classic";
let customAudioEl = null;

// pré-carrega o áudio customizado no load (não só na primeira doação) pra
// não ter latência perceptível no primeiro alerta da live
function applyCustomSound(url) {
  if (!url) {
    customAudioEl = null;
    return;
  }
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.addEventListener("error", () => { customAudioEl = null; });
  customAudioEl = audio;
}

fetch(`/api/l/${LEILAO_ID}/alert-config`)
  .then((r) => r.json())
  .then((d) => {
    if (CHIME_PRESETS[d.chime] || d.chime === "custom") currentChime = d.chime;
    applyCustomSound(d.soundUrl);
  })
  .catch(() => {});

// troca ao vivo, sem precisar recarregar a Browser Source no OBS -- disparado
// só quando o streamer muda o som no Perfil, não em toda doação
socket.on("alert-config", (data) => {
  if (!data) return;
  if (CHIME_PRESETS[data.chime] || data.chime === "custom") currentChime = data.chime;
  applyCustomSound(data.soundUrl);
});

function playChime(isRemove) {
  if (currentChime === "custom" && customAudioEl) {
    customAudioEl.currentTime = 0;
    const playPromise = customAudioEl.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => playSynthChime(isRemove));
    }
    return;
  }
  playSynthChime(isRemove);
}

function playSynthChime(isRemove) {
  try {
    const preset = CHIME_PRESETS[currentChime] || CHIME_PRESETS.classic;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const notes = isRemove ? preset.sabota : preset.apoio;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = preset.wave;
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
  if (item.comboCount >= 2) {
    comboEl.textContent = `×${item.comboCount} combo`;
    comboEl.hidden = false;
  } else {
    comboEl.hidden = true;
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

// Timeouts de segurança: voz travada (áudio não chega, ou fica preso) não pode segurar a fila de alertas.
function scheduleHide(item) {
  if (!item.note || !item.voiceId) {
    startHideTimer(SHOW_MS);
    return;
  }
  let settled = false;
  const finish = (delayMs) => {
    if (settled) return;
    settled = true;
    startHideTimer(delayMs);
  };
  const safety = setTimeout(() => finish(SHOW_MS), 12000);

  setTimeout(async () => {
    try {
      const res = await fetch(`/api/tts?text=${encodeURIComponent(item.note)}`);
      if (!res.ok) throw new Error("tts falhou");
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.addEventListener("ended", () => { clearTimeout(safety); finish(700); });
      audio.addEventListener("error", () => { clearTimeout(safety); finish(SHOW_MS); });
      await audio.play();
    } catch (err) {
      clearTimeout(safety);
      finish(SHOW_MS);
    }
  }, 450);
}

socket.on("update", ({ leaderboard, lastEvent }) => {
  document.documentElement.dataset.theme = leaderboard.theme || "cinza";

  if (!lastEvent || !lastEvent.game) return;
  if (lastEvent.type !== "add" && lastEvent.type !== "remove") return;

  queue.push(lastEvent);
  showNext();
});

socket.on("test-alert", (lastEvent) => {
  queue.push(lastEvent);
  showNext();
});
