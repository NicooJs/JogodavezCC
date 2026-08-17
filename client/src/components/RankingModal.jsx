import { useEffect, useState } from 'react'
import { formatBRL } from '../lib/format.js'
import { RankBadge } from './icons.jsx'

export default function RankingModal({ leilaoId, open, onClose }) {
  const [ranking, setRanking] = useState(null)

  useEffect(() => {
    if (!open) return
    setRanking(null)
    fetch(`/api/l/${leilaoId}/ranking`)
      .then((res) => res.json())
      .then((data) => setRanking(data.ranking || []))
      .catch((err) => {
        console.error('Erro ao carregar ranking:', err.message)
        setRanking([])
      })
  }, [open, leilaoId])

  if (!open) return null

  const top3 = (ranking || []).slice(0, 3)
  const rest = (ranking || []).slice(3, 10)

  return (
    <div className="modal-overlay ranking-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ranking-modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="ranking-modal-head">
          <p className="modal-eyebrow">seus leilões</p>
          <h2 className="modal-title">Ranking dos seus leilões</h2>
        </div>
        <div className="ranking-modal-body">
          {ranking && ranking.length === 0 ? (
            <p className="empty-state">Nenhum leilão arrecadou nada ainda.</p>
          ) : (
            <>
              <div className="recap-podium ranking-podium">
                {top3.map((row) => (
                  <div className={`recap-podium-card rank-${row.rank}`} key={row.rank}>
                    <span className="recap-podium-rank"><RankBadge rank={row.rank} /></span>
                    <p className="recap-podium-name">{row.title}</p>
                    <p className="recap-podium-total">{formatBRL(row.totalRaised)}</p>
                  </div>
                ))}
              </div>
              <div className="ranking-list">
                {rest.map((row) => (
                  <div className="ranking-row" key={row.rank}>
                    <span className="ranking-row-rank">{String(row.rank).padStart(2, '0')}</span>
                    <span className="ranking-row-host">{row.title}</span>
                    <span className="ranking-row-total">{formatBRL(row.totalRaised)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
