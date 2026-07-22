// Versão fixada (não @latest): uma atualização deles não pode quebrar o
// board em produção sem a gente escolher isso.
import { animate } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduceMotion) {
  document.querySelectorAll(".board-bg-shard").forEach((el, i) => {
    const baseOpacity = parseFloat(getComputedStyle(el).opacity) || 0.2;
    const duration = 16 + Math.random() * 10;
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
