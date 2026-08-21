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
}

window.JogodaVezBoardPanel = { mount, unmount }
