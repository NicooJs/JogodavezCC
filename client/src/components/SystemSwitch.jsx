export default function SystemSwitch({ activeSystem, onSwitch, visible, profileHref, hostAvatar }) {
  const isReacts = activeSystem === 'reacts'

  return (
    <div className="system-switch" id="system-switch" hidden={!visible}>
      <img className="system-switch-brand" src="/favicon-32.png" alt="JogodaVez" />
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
