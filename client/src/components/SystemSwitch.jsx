export default function SystemSwitch({
  activeSystem,
  onSwitch,
  visible,
  profileHref,
  hostAvatar,
  onOpenSettings,
  onOpenRanking,
  onOpenHistory,
}) {
  const isReacts = activeSystem === 'reacts'

  return (
    <div className="system-switch" id="system-switch" hidden={!visible}>
      <a className="system-switch-brand" href="/painel" title="Início">
        <img src="/favicon-32.png" alt="JogodaVez" />
      </a>
      <nav className="system-switch-nav">
        <button
          className={`system-switch-item${isReacts ? '' : ' active'}`}
          type="button"
          data-system="leilao"
          title="Modo leilão"
          aria-label="Modo leilão"
          aria-pressed={String(!isReacts)}
          onClick={() => onSwitch('leilao')}
        >
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="6" height="6" rx="1" /><rect x="11.5" y="4" width="6" height="6" rx="1" /><rect x="2.5" y="12" width="6" height="4" rx="1" /><rect x="11.5" y="12" width="6" height="4" rx="1" /></svg>
        </button>
        <button
          className={`system-switch-item${isReacts ? ' active' : ''}`}
          type="button"
          data-system="reacts"
          title="Modo reacts"
          aria-label="Modo reacts"
          aria-pressed={String(isReacts)}
          onClick={() => onSwitch('reacts')}
        >
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" /><path d="M8.2 8.1l4 2.1-4 2.1V8.1z" fill="currentColor" stroke="none" /><path d="M6 17h8" /></svg>
        </button>
      </nav>

      <span className="system-switch-sep" aria-hidden="true" />

      <nav className="system-switch-nav">
        <button className="system-switch-item" type="button" title="Configurações" aria-label="Configurações" onClick={onOpenSettings}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        <button className="system-switch-item" type="button" title="Ranking dos seus leilões" aria-label="Ranking dos seus leilões" onClick={onOpenRanking}>
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4h8v3.5a4 4 0 0 1-8 0V4z" /><path d="M6 5H3.5A1.5 1.5 0 0 0 2 6.5v0A2.5 2.5 0 0 0 4.5 9H6M14 5h2.5A1.5 1.5 0 0 1 18 6.5v0A2.5 2.5 0 0 1 15.5 9H14" /><path d="M10 11.5V14" /><path d="M7 16.5h6" /><path d="M8 14h4l.6 2.5H7.4L8 14z" /></svg>
        </button>
        <button className="system-switch-item" type="button" title="Histórico de leilões" aria-label="Histórico de leilões" onClick={onOpenHistory}>
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 5.5V10l3 2" /><circle cx="10" cy="10" r="7" /></svg>
        </button>
      </nav>

      <a
        className="system-switch-profile"
        target="_blank"
        rel="noopener"
        title="Ver perfil"
        aria-label="Ver perfil"
        href={profileHref || undefined}
      >
        {hostAvatar ? (
          <img className="system-switch-profile-avatar" src={hostAvatar} alt="" />
        ) : (
          <span className="system-switch-profile-placeholder">?</span>
        )}
      </a>
    </div>
  )
}
