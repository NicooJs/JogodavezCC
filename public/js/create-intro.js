// Anima a entrada da tela de criação (título palavra por palavra, resto do
// conteúdo em sequência) e monta a tira de prova social com dado real —
// GET /api/ranking, o mesmo endpoint que já alimenta o ranking do board,
// então segue a mesma fronteira de privacidade de quem já pediu pra
// esconder o total (hideTotalRaised) sem precisar reimplementar nada disso
// aqui.
//
// import() dinâmico (não import estático no topo) de propósito: se o CDN
// do Motion falhar (rede, ad-blocker, etc.), cai no catch e revela tudo na
// marra em vez de deixar a página com conteúdo escondido pra sempre — os
// elementos animados começam com opacity:0 no CSS (.reveal-item,
// .create-word em create.css), então SEMPRE precisam de alguém revelando,
// com ou sem a animação de verdade.
const titleEl = document.getElementById("create-title");
const revealEls = [...document.querySelectorAll(".reveal-item")];
const proofEl = document.getElementById("create-proof");
const proofAvatarsEl = document.getElementById("create-proof-avatars");
const proofTextEl = document.getElementById("create-proof-text");

// Quebra o título em palavras dentro de spans, pra animar uma de cada vez.
// aria-label no <h1> (já no HTML) garante que leitor de tela anuncia a
// frase inteira, não palavra por palavra dos spans.
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
