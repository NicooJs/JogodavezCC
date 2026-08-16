import { createRoot } from 'react-dom/client'
import HistoricoStandalone from './HistoricoStandalone.jsx'

// entry separado do board (ver vite.config.js), mesmo padrão do
// settings-main.jsx -- carregado sob demanda pelo hub (public/js/painel.js)
let root = null

function mount(containerId, leilaoId) {
  const el = document.getElementById(containerId)
  if (!el) return
  if (!root) root = createRoot(el)
  root.render(<HistoricoStandalone leilaoId={leilaoId} />)
}

window.JogodaVezHistoricoPanel = { mount }
