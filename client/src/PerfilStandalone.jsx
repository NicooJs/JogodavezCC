import { useEffect, useState } from 'react'
import { DialogsProvider, useDialogs } from './hooks/useDialogs.jsx'
import { formatBRL } from './lib/format.js'
import VisaoGeralTab from './components/perfil/VisaoGeralTab.jsx'

const TABS = [
  {
    id: 'geral',
    label: 'Visão geral',
    subtitle: 'Suas doações dos últimos 30 dias.',
    icon: <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10L10 4l7 6" /><path d="M5 8.7V16h10V8.7" /></svg>,
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    subtitle: 'Saldo, chave Pix e histórico de saques.',
    icon: <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="14" height="10" rx="1.5" /><path d="M3 9h14" /><circle cx="14" cy="12.5" r="0.7" fill="currentColor" stroke="none" /></svg>,
  },
  {
    id: 'obs',
    label: 'Widget OBS',
    subtitle: 'Link do overlay de alertas pra colar no OBS.',
    icon: <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="14" height="9.5" rx="1.3" /><path d="M7 17h6M10 13.5V17" /></svg>,
  },
  {
    id: 'alerta',
    label: 'Alerta',
    subtitle: 'Som do alerta de doação, vale pra todos os seus leilões.',
    icon: <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.3a4 4 0 0 0-4 4v2.1c0 .8-.3 1.5-.8 2.1L4 13h12l-1.2-1.5a3.3 3.3 0 0 1-.8-2.1V7.3a4 4 0 0 0-4-4z" /><path d="M8.3 15.2a1.8 1.8 0 0 0 3.4 0" /></svg>,
  },
  {
    id: 'doacoes',
    label: 'Doações',
    subtitle: 'Histórico de doações recebidas e bloqueio de doador.',
    icon: <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="6.7" /><path d="M10 6.8v6.4M7.8 8.3c0-.9.9-1.5 2.2-1.5s2.2.6 2.2 1.4-.9 1.2-2.2 1.4c-1.3.2-2.2.6-2.2 1.4s.9 1.5 2.2 1.5 2.2-.6 2.2-1.5" /></svg>,
  },
]

function LogoutButton() {
  const { confirmDialog } = useDialogs()

  const onClick = async () => {
    const ok = await confirmDialog({
      title: 'Sair da conta',
      message: 'Isso desconecta sua conta da Twitch nesse navegador.',
      confirmLabel: 'Sair',
      danger: true,
    })
    if (!ok) return
    await fetch('/api/session/logout', { method: 'POST' }).catch(() => {})
    location.href = '/'
  }

  return (
    <button className="perfil-nav-item perfil-nav-logout" type="button" onClick={onClick}>
      <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /><path d="M12.5 13.5l3-3.5-3-3.5" /><path d="M15.3 10H7.5" /></svg>
      <span>Sair da conta</span>
    </button>
  )
}

function PerfilContent({ data, tab, setTab }) {
  const active = TABS.find((t) => t.id === tab)
  const since = data.connectedAt
    ? new Date(data.connectedAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    : null

  return (
    <div className="perfil-shell">
      <aside className="perfil-sidebar">
        <div className="perfil-sidebar-identity">
          {data.avatarUrl ? (
            <img className="perfil-avatar" src={data.avatarUrl} alt="" />
          ) : (
            <div className="perfil-avatar" />
          )}
          <div className="perfil-identity-text">
            <p className="perfil-name">{data.displayName || data.twitchLogin || ''}</p>
            <p className="perfil-login">
              {data.twitchLogin ? `@${data.twitchLogin}` : ''}
              {since ? <span className="perfil-since">streamer desde {since}</span> : null}
            </p>
          </div>
          <div className="perfil-lifetime">
            <span className="perfil-lifetime-value">{formatBRL((data.lifetimeEarnedCents || 0) / 100)}</span>
            <span className="perfil-lifetime-label">arrecadado no total</span>
          </div>
        </div>

        <nav className="perfil-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`perfil-nav-item${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="perfil-sidebar-divider" />
        <LogoutButton />
      </aside>

      <div className="perfil-content">
        <div className="perfil-section-header">
          <span className="perfil-section-header-icon" aria-hidden="true">{active.icon}</span>
          <div>
            <h1 className="perfil-section-title">{active.label}</h1>
            <p className="perfil-section-subtitle">{active.subtitle}</p>
          </div>
        </div>

        {tab === 'geral' ? (
          <VisaoGeralTab data={data} />
        ) : (
          <p className="empty-state">Essa seção está sendo reconstruída aqui dentro do painel. Chega em breve.</p>
        )}
      </div>
    </div>
  )
}

export default function PerfilStandalone() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState('geral')

  useEffect(() => {
    fetch('/api/perfil')
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) return <p className="empty-state">Não deu pra carregar seu perfil agora.</p>
  if (!data) return <p className="hub-modal-loading">Carregando…</p>

  return (
    <DialogsProvider leilaoId={null}>
      <PerfilContent data={data} tab={tab} setTab={setTab} />
    </DialogsProvider>
  )
}
