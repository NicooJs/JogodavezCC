const titleEl = document.getElementById("create-title");
const revealEls = [...document.querySelectorAll(".reveal-item")];

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

async function run() {
  const words = titleEl ? splitTitleIntoWords(titleEl) : [];

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
