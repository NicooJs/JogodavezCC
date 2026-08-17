import { createRoot } from 'react-dom/client'
import PerfilStandalone from './PerfilStandalone.jsx'

// entry separado do board (ver vite.config.js), mesmo padrão de
// settings-main.jsx/historico-main.jsx
let root = null

function mount(containerId) {
  const el = document.getElementById(containerId)
  if (!el) return
  if (!root) root = createRoot(el)
  root.render(<PerfilStandalone />)
}

window.JogodaVezPerfilPanel = { mount }
