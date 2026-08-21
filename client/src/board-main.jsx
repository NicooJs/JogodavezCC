import { createRoot } from 'react-dom/client'
import BoardEmbedStandalone from './BoardEmbedStandalone.jsx'

// entry separado do board (ver vite.config.js) -- carregado pelo hub sob
// demanda, na primeira vez que a view "Leilão" é aberta. Diferente dos
// outros standalones do hub (que nunca desmontam, só ficam hidden), esse
// expõe unmount() de verdade -- ao sair da view, o socket precisa fechar
// (decisão do plano: não deixar conexão ao vivo rodando em segundo plano),
// e fechar o socket exige desmontar a árvore React que o abriu.
let root = null

function mount(containerId, leilaoId) {
  const el = document.getElementById(containerId)
  if (!el) return
  root = createRoot(el)
  root.render(<BoardEmbedStandalone leilaoId={leilaoId} />)
}

function unmount() {
  if (!root) return
  root.unmount()
  root = null
  // limpa os efeitos que o board aplica no body/html compartilhado do hub
  // (fundo de capas, imagem de fundo custom, tema) -- na página /l/:id
  // isso nunca precisou de limpeza porque sair sempre recarregava a
  // página inteira; aqui só desmonta, então o que não for revertido fica
  // pendurado até a próxima vez que alguém entrar na view Leilão
  document.body.classList.remove('has-covers', 'has-bg-image', 'presenter-mode')
  document.body.style.removeProperty('--bg-image')
  delete document.documentElement.dataset.theme
}

window.JogodaVezBoardPanel = { mount, unmount }
