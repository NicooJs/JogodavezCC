import { createRoot } from 'react-dom/client'
import SettingsStandalone from './SettingsStandalone.jsx'

// entry separado do board (ver vite.config.js) -- carregado sob demanda pelo
// hub (public/js/painel.js), que injeta esse script dinamicamente na
// primeira vez que o streamer abre Configurações. Expõe um mount()
// idempotente porque o módulo só é avaliado uma vez pelo browser (ESM),
// mas o streamer pode abrir/fechar o drawer várias vezes na mesma sessão.
let root = null

function mount(containerId, leilaoId) {
  const el = document.getElementById(containerId)
  if (!el) return
  if (!root) root = createRoot(el)
  root.render(<SettingsStandalone leilaoId={leilaoId} />)
}

window.JogodaVezSettingsPanel = { mount }
