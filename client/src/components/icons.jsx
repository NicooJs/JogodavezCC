export function MedalIcon() {
  return (
    <svg className="medal-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 11L4.5 17.5L7.3 16.6L9 19L10.8 14.8" fill="currentColor" opacity="0.85" />
      <path d="M12.5 11L15.5 17.5L12.7 16.6L11 19L9.2 14.8" fill="currentColor" opacity="0.85" />
      <circle cx="10" cy="7.5" r="5.5" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.6" y="6.1" width="2.8" height="2.8" fill="currentColor" transform="rotate(45 10 7.5)" />
    </svg>
  )
}

export function RankBadge({ rank }) {
  return (
    <>
      {rank <= 3 ? <MedalIcon /> : null}
      <b>{String(rank).padStart(2, '0')}</b>
    </>
  )
}

export function FlagIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2.5v15" />
      <path d="M4 3.5c2-1 3.5 1 5.5 0s3.5-1 5.5 0v6c-2-1-3.5 1-5.5 0s-3.5-1-5.5 0z" />
    </svg>
  )
}

// mesmo glifo oficial da Twitch usado em .host-twitch-badge (HostPanel.jsx)
// -- aqui serve de placeholder pra lote sem capa (jogo desconhecido ou
// "quadro" da live que não é jogo/filme de verdade, nunca vai achar capa)
export function TwitchIcon() {
  return (
    <svg className="icon" viewBox="0 0 2400 2800" fill="currentColor" aria-hidden="true">
      <path d="M500 0 0 500v1800h600v500l500-500h400l900-900V0H500zm1600 1300-400 400h-400l-350 350v-350H500V200h1600v1100z" />
      <path d="M1700 550h200v600h-200zM1150 550h200v600h-200z" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5h12" />
      <path d="M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M5.5 5.5l.6 10a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-10" />
      <path d="M8.3 8.5v5M11.7 8.5v5" />
    </svg>
  )
}

export function StopIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M7 7l6 6M13 7l-6 6" />
    </svg>
  )
}

export function ReactModeIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" />
      <path d="M8.2 8.1l4 2.1-4 2.1V8.1z" fill="currentColor" stroke="none" />
      <path d="M6 17h8" />
    </svg>
  )
}

export function PlayIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7.5v5l4.5-2.5-4.5-2.5z" fill="currentColor" stroke="none" />
      <path d="M13 6.8a4 4 0 0 1 0 6.4M15.3 4.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  )
}
