export default function HostPanel({ leaderboard }) {
  const host = leaderboard?.host || 'Streamer'
  const hostAvatar = leaderboard?.hostAvatar || null
  const twitchUrl =
    leaderboard?.hostVerified && leaderboard?.hostTwitchLogin
      ? `https://twitch.tv/${encodeURIComponent(leaderboard.hostTwitchLogin)}`
      : null

  return (
    <section className="panel host-panel">
      <p className="panel-label panel-label-icon" title="Host do leilão">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="6.5" r="3.2" />
          <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
        <span className="sr-only">Host do leilão</span>
      </p>
      <div className="host-card">
        <div className="host-row">
          <div className="host-avatar-wrap">
            {hostAvatar ? <img className="host-avatar" id="host-avatar" src={hostAvatar} alt="" /> : null}
            {twitchUrl ? (
              <a className="host-twitch-badge" href={twitchUrl} target="_blank" rel="noopener" aria-label="Ver no Twitch" title="Ver no Twitch">
                <svg className="icon" viewBox="0 0 2400 2800" fill="currentColor" aria-hidden="true">
                  <path d="M500 0 0 500v1800h600v500l500-500h400l900-900V0H500zm1600 1300-400 400h-400l-350 350v-350H500V200h1600v1100z" />
                  <path d="M1700 550h200v600h-200zM1150 550h200v600h-200z" />
                </svg>
              </a>
            ) : null}
          </div>
          <div className="host-info">
            <h1 className="host-name" id="host-name">{host}</h1>
            {twitchUrl ? (
              <a className="host-twitch-link" href={twitchUrl} target="_blank" rel="noopener">
                {`twitch.tv/${leaderboard.hostTwitchLogin}`}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
