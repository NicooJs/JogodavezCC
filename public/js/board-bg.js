// Anima o fundo decorativo do board (ver .board-bg em style.css) com o
// Motion (motion.dev) -- mesmo padrão de public/js/create-bg.js, só que
// mais discreto (menos losangos, sem brilho central): o board é 3 colunas
// cheias de informação, bem mais denso que a tela de criação.
//
// Versão fixada (não "@latest") de propósito, mesmo motivo do create-bg.js
// -- uma atualização deles não pode quebrar o board em produção sem a
// gente escolher isso.
import { animate } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduceMotion) {
  document.querySelectorAll(".board-bg-shard").forEach((el, i) => {
    const baseOpacity = parseFloat(getComputedStyle(el).opacity) || 0.2;
    const duration = 16 + Math.random() * 10; // 16-26s, cada losango dessincronizado dos outros
    const driftY = 10 + Math.random() * 14;
    const driftX = (Math.random() - 0.5) * 18;
    const rotateBy = 45 + (Math.random() - 0.5) * 24;

    animate(
      el,
      {
        y: [0, -driftY, 0],
        x: [0, driftX, 0],
        rotate: [45, rotateBy, 45],
        opacity: [baseOpacity, baseOpacity * 1.5, baseOpacity],
      },
      { duration, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }
    );
  });
}
