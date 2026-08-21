import { createRoot } from 'react-dom/client'
import SidebarStandalone from './SidebarStandalone.jsx'

// entry separado do board (ver vite.config.js) -- carregado pelo hub
// (public/js/painel.js) assim que a sessão carrega, já que a sidebar fica
// visível o tempo todo (diferente de Configurações/Histórico/Perfil, que
// montam só na primeira vez que a view é aberta). mount() é chamado de
// novo a cada troca de view só pra atualizar activeView -- root persiste,
// vira um re-render comum.
let root = null

function mount(containerId, props) {
  const el = document.getElementById(containerId)
  if (!el) return
  if (!root) root = createRoot(el)
  root.render(<SidebarStandalone {...props} />)
}

window.JogodaVezSidebar = { mount }
