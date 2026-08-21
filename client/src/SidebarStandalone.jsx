import NavRail from './components/NavRail.jsx'

const ICON_HOME = (
  <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.3" /><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.3" /><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.3" /><rect x="11" y="11" width="6.5" height="6.5" rx="1.3" /></svg>
)
const ICON_PERFIL = (
  <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3.2" /><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" /></svg>
)
const ICON_CONFIG = (
  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
)
const ICON_HISTORICO = (
  <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 5.5V10l3 2" /><circle cx="10" cy="10" r="7" /></svg>
)

// espelha a sidebar do board (client/src/components/SystemSwitch.jsx),
// mesmo NavRail -- diferença: aqui os itens navegam de verdade (trocam a
// view do hub via onNavigate) em vez de abrir modal, e o rodapé é logout
// (onLogout), não link de perfil. Sem ícone de "Leilão"/ferramenta aqui
// de propósito -- a Visão geral (Início) já mostra os cards de
// ferramenta, não precisa duplicar como item fixo da sidebar.
export default function SidebarStandalone({ activeView, avatarUrl, onNavigate, onLogout }) {
  const items = [
    { key: 'home', title: 'Visão geral', icon: ICON_HOME, active: activeView === 'home', onClick: () => onNavigate('home') },
    { key: 'perfil', title: 'Perfil', icon: ICON_PERFIL, active: activeView === 'perfil', onClick: () => onNavigate('perfil') },
    { key: 'historico', title: 'Histórico de leilões', icon: ICON_HISTORICO, active: activeView === 'historico', onClick: () => onNavigate('historico') },
    { key: 'config', title: 'Configurações', icon: ICON_CONFIG, active: activeView === 'config', onClick: () => onNavigate('config') },
  ]

  return (
    <NavRail
      brand={{ iconSrc: '/favicon-32.png', title: 'JogodaVez' }}
      items={items}
      footer={{ title: 'Sair da conta', avatarUrl, onClick: onLogout, showExitBadge: true }}
    />
  )
}
