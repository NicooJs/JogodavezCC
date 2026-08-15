import { presenterFetch } from '../lib/api.js'
import { useReactMultiplierEditor } from '../hooks/useReactMultiplierEditor.js'

function sortByUpdatedAt(videos) {
  return [...videos].sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0))
}

export default function ReactsPlayer({ leilaoId, leaderboard, presenterActive }) {
  const queue = sortByUpdatedAt((leaderboard.reactVideos || []).filter((v) => v.status === 'unlocked'))
  const current = queue[0] || null
  const multiplier = useReactMultiplierEditor(leilaoId, leaderboard.reactMultiplier)

  const markReacted = async () => {
    if (!current) return
    try {
      await presenterFetch(leilaoId, `/admin/reacts/${current.id}/mark-reacted`, { method: 'POST' })
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <section className="reacts-player">
      <div className="reacts-player-head">
        <p className="reacts-mode-label">reacts</p>
        <span className="reacts-live-pill">
          <span className="reacts-live-dot" aria-hidden="true" />
          <span>ao vivo</span>
        </span>
        {presenterActive ? (
          <div className="reacts-rate-chip">
            <span className="reacts-rate-chip-label">valor por minuto</span>
            <div className="reacts-rate-chip-value">
              <span>R$</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Valor por minuto"
                value={multiplier.draft}
                onChange={(e) => multiplier.setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && multiplier.commit()}
              />
            </div>
            <button className="reacts-rate-chip-edit" type="button" aria-label="Confirmar valor" onClick={multiplier.commit}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
            </button>
          </div>
        ) : null}
      </div>

      {current ? (
        <div className="reacts-player-card">
          <div className="reacts-player-frame" style={current.thumbnail ? { backgroundImage: `url("${current.thumbnail}")` } : undefined}>
            <span className="reacts-player-play" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4.2c0-.9 1-1.5 1.8-1l8 5.8c.7.5.7 1.5 0 2l-8 5.8c-.8.5-1.8-.1-1.8-1V4.2z" /></svg>
            </span>
          </div>
          <div className="reacts-player-body">
            <h1 className="reacts-player-title">{current.title || 'Vídeo sem título'}</h1>
            <div className="reacts-player-meta-row">
              <span className="reacts-player-submitter">sugerido por <b>{current.submittedBy || 'Anônimo'}</b></span>
              {presenterActive ? (
                <button className="reacts-btn reacts-btn-primary" type="button" onClick={markReacted}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
                  marcar como reagido
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="reacts-player-empty">
          <p>Nenhum vídeo liberado ainda</p>
          <span>Assim que uma doação bater a meta de um vídeo, ele aparece aqui pra reagir.</span>
        </div>
      )}
    </section>
  )
}
