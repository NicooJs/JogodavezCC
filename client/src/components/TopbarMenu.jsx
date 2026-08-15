import { useState } from 'react'

export default function TopbarMenu({
  leilaoId,
  connected,
  hostAvatar,
  presenterActive,
  isOwner,
  profileHref,
  onRequestLogin,
  onLogout,
  onModCodeGenerated,
  onOpenSettings,
  onOpenRanking,
}) {
  const [open, setOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const togglePresenter = async () => {
    if (presenterActive) {
      if (!isOwner) return
      setGenerating(true)
      try {
        const res = await fetch(`/api/l/${leilaoId}/admin/generate-code`, { method: 'POST', credentials: 'same-origin' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Não foi possível gerar o código')
        onModCodeGenerated(data.code)
      } catch (err) {
        alert(err.message)
      } finally {
        setGenerating(false)
      }
      return
    }
    onRequestLogin()
  }

  return (
    <div className="topbar-menu">
      <a className="topbar-menu-avatar-link" target="_blank" rel="noopener" aria-label="Ver perfil" href={profileHref || undefined}>
        {hostAvatar ? (
          <img className="topbar-menu-avatar" src={hostAvatar} alt="" />
        ) : (
          <span className="topbar-menu-avatar-placeholder">?</span>
        )}
      </a>
      <button
        className="topbar-menu-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={String(open)}
        aria-label="Menu"
        onClick={() => setOpen(!open)}
      >
        <svg className="icon topbar-menu-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
      </button>
      {open ? (
        <div className="topbar-menu-dropdown">
          <span className={`status${connected ? ' online' : ''}`}>
            <span className="dot" />
            <span>{connected ? 'ao vivo' : 'conectando…'}</span>
          </span>
          <button className="ranking-open-btn" type="button" title="Ranking dos seus leilões" onClick={onOpenRanking}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4h8v3.5a4 4 0 0 1-8 0V4z" /><path d="M6 5H3.5A1.5 1.5 0 0 0 2 6.5v0A2.5 2.5 0 0 0 4.5 9H6M14 5h2.5A1.5 1.5 0 0 1 18 6.5v0A2.5 2.5 0 0 1 15.5 9H14" /><path d="M10 11.5V14" /><path d="M7 16.5h6" /><path d="M8 14h4l.6 2.5H7.4L8 14z" /></svg>
            Ranking
          </button>
          <div className="presenter-toggle-wrap">
            <button className={`presenter-toggle${presenterActive ? ' active' : ''}`} type="button" disabled={generating} onClick={togglePresenter}>
              <span className="presenter-toggle-dot" aria-hidden="true" />
              <span className="presenter-toggle-label">
                {presenterActive ? (isOwner ? 'Gerar código para moderador' : 'Modo apresentador ativo') : 'modo apresentador'}
              </span>
            </button>
            {presenterActive ? (
              <button className="presenter-toggle-exit" type="button" title="Sair do modo apresentador" aria-label="Sair do modo apresentador" onClick={onLogout}>✕</button>
            ) : null}
          </div>
          {presenterActive ? (
            <button className="ranking-open-btn" type="button" title="Configurações" aria-label="Configurações" onClick={onOpenSettings}>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
              Configurações
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
