// Anima o fundo decorativo da tela de criação (ver .create-bg em
// create.css) com o Motion (motion.dev), carregado via ESM direto do CDN --
// projeto não tem bundler/build step, então isso é carregado puro pelo
// navegador, sem npm install nem passo de compilação nenhum.
//
// Versão fixada (não "@latest") de propósito -- uma atualização deles não
// pode quebrar a tela de criação em produção sem a gente escolher isso.
import { animate } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

// Respeita a preferência do sistema por menos movimento -- o resto do site
// já reduz CSS animation/transition pra isso (ver style.css), essa aqui é
// via JS então precisa da própria checagem.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduceMotion) {
  document.querySelectorAll(".bg-shard").forEach((el, i) => {
    const baseOpacity = parseFloat(getComputedStyle(el).opacity) || 0.22;
    const duration = 14 + Math.random() * 10; // 14-24s, cada losango dessincronizado dos outros
    const driftY = 14 + Math.random() * 18;
    const driftX = (Math.random() - 0.5) * 24;
    const rotateBy = 45 + (Math.random() - 0.5) * 30;

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

  const spotlight = document.querySelector(".bg-spotlight");
  if (spotlight) {
    animate(
      spotlight,
      { x: ["-50%", "-38%", "-58%", "-50%"], y: [0, 40, -20, 0] },
      { duration: 26, repeat: Infinity, ease: "easeInOut" }
    );
  }
}
