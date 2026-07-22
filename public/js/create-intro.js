// Tira de prova social reaproveita GET /api/ranking (mesmo endpoint do
// board), então já respeita hideTotalRaised sem reimplementar essa lógica
// aqui.
//
// import() dinâmico (não estático) de propósito: se o CDN do Motion
// falhar, o catch revela o conteúdo na hora em vez de deixá-lo preso em
// opacity:0 pra sempre (.reveal-item/.create-word começam escondidos no
// CSS e dependem do JS pra revelar, com ou sem animação).
const titleEl = document.getElementById("create-title");
const revealEls = [...document.querySelectorAll(".reveal-item")];
const proofEl = document.getElementById("create-proof");
const proofAvatarsEl = document.getElementById("create-proof-avatars");
const proofTextEl = document.getElementById("create-proof-text");

// Quebra em spans por palavra pra animar em sequência; aria-label no <h1>
// (no HTML) mantém leitor de tela anunciando a frase inteira.
function splitTitleIntoWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w) => `<span class="create-word">${w}</span>`).join(" ");
  return [...el.querySelectorAll(".create-word")];
}

function revealInstantly(els) {
  els.forEach((el) => {
    el.style.opacity = 1;
    el.style.transform = "none";
  });
}

async function loadProof() {
  try {
    const res = await fetch("/api/ranking");
    if (!res.ok) return;
    const { ranking } = await res.json();
    if (!ranking || ranking.length === 0) return; // produto novo, sem streamer ainda -- não mostra nada em vez de "0"

    const top = ranking.slice(0, 5);
    proofAvatarsEl.innerHTML = top
      .filter((row) => row.hostAvatar)
      .map((row) => `<img src="${row.hostAvatar.replace(/"/g, "&quot;")}" alt="" loading="lazy" />`)
      .join("");

    const totalRaised = ranking.reduce((sum, row) => sum + (row.totalRaised || 0), 0);
    const totalBRL = totalRaised.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const streamerWord = ranking.length === 1 ? "streamer" : "streamers";
    proofTextEl.innerHTML = `<strong>${ranking.length} ${streamerWord}</strong> já arrecadaram <strong>${totalBRL}</strong> com o site`;

    proofEl.hidden = false;
  } catch (err) {
    // sem prova social nenhuma é um degrade aceitável -- não é informação
    // essencial pra criar um leilão, só reforço de confiança
    console.error("Falha ao carregar prova social:", err.message);
  }
}

async function run() {
  const words = titleEl ? splitTitleIntoWords(titleEl) : [];
  await loadProof(); // roda antes da animação pra decidir se .create-proof entra revelado ou hidden desde o início

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    revealInstantly(words);
    revealInstantly(revealEls);
    return;
  }

  try {
    const { animate, stagger } = await import("https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm");

    if (words.length) {
      animate(words, { opacity: [0, 1], y: ["0.2em", "0em"] }, { duration: 0.5, delay: stagger(0.045), ease: "easeOut" });
    }
    animate(
      revealEls,
      { opacity: [0, 1], y: [14, 0] },
      { duration: 0.6, delay: stagger(0.08, { startDelay: words.length ? 0.25 : 0 }), ease: "easeOut" }
    );
  } catch (err) {
    console.error("Falha ao animar entrada da página:", err.message);
    revealInstantly(words);
    revealInstantly(revealEls);
  }
}

run();
