import { useEffect, useState } from 'react'
import { formatBRL, initial } from '../lib/format.js'

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—'
  const totalMin = Math.round(ms / 60000)
  if (totalMin === 0) return '<1min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  return `${h}h${String(m).padStart(2, '0')}`
}

export default function HistoryOverlay({ leilaoId, open, onClose, onOpenRecap }) {
  const [history, setHistory] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoaded(false)
    fetch(`/api/l/${leilaoId}/recap/history`)
      .then((res) => res.json())
      .then((data) => {
        setHistory(data.history || [])
        setLoaded(true)
      })
      .catch((err) => {
        console.error('Erro ao carregar histórico:', err.message)
        setLoaded(true)
      })
  }, [open, leilaoId])

  if (!open) return null

  return (
    <div className="history-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="history-modal" role="dialog" aria-modal="true">
        <button className="recap-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <h2 className="history-modal-title">Histórico de leilões</h2>
        {loaded && history.length === 0 ? (
          <p className="history-modal-empty">Nenhum leilão zerado ainda. Assim que você usar "zerar leilão", os rounds anteriores aparecem aqui.</p>
        ) : null}
        <div className="history-grid">
          {history.map((h, index) => {
            const when = h.archivedAt ? new Date(h.archivedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
            const champion = h.topGames && h.topGames[0] ? h.topGames[0] : null
            return (
              <button
                className="history-card"
                type="button"
                key={index}
                onClick={() => {
                  onClose()
                  onOpenRecap(index)
                }}
              >
                <span className="history-card-when">
                  {when}
                  {h.openRound ? <span className="history-card-inprogress">em andamento</span> : null}
                </span>
                <span className="history-card-total">{h.totalRaised === null ? 'oculto' : formatBRL(h.totalRaised || 0)}</span>
                <div className="history-card-champion">
                  {champion && champion.image ? (
                    <img className="history-card-thumb" src={champion.image} alt="" />
                  ) : (
                    <div className="history-card-thumb history-card-thumb-placeholder">{initial(champion ? champion.name : '?')}</div>
                  )}
                  <span className="history-card-champion-name">{champion ? champion.name : '—'}</span>
                </div>
                <div className="history-card-meta">
                  <span>{h.totalGames || 0} lotes</span>
                  <span>{h.totalDonors || 0} apoiadores</span>
                  <span>{formatDuration(h.durationMs)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
