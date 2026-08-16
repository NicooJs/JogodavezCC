import { useEffect, useState } from 'react'
import { formatBRL, initial } from './lib/format.js'
import { mediaLabel } from './lib/media.js'

function relativeDate(iso) {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `${days} dias atrás`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'} atrás`
  const years = Math.floor(months / 12)
  return `${years} ${years === 1 ? 'ano' : 'anos'} atrás`
}

function formatDuration(ms) {
  if (!ms) return null
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ''}`
  return `${m}min`
}

function SummaryCard({ totalAllTime, roundCount, avgPerRound, bestRound }) {
  return (
    <div className="hist-widget">
      <p className="hist-widget-title">Resumo geral</p>
      <div className="hist-summary-row">
        <span className="hist-summary-label">Arrecadado no total</span>
        <span className="hist-summary-value">{formatBRL(totalAllTime)}</span>
      </div>
      <div className="hist-summary-row">
        <span className="hist-summary-label">Rounds encerrados</span>
        <span className="hist-summary-value">{roundCount}</span>
      </div>
      <div className="hist-summary-row">
        <span className="hist-summary-label">Média por round</span>
        <span className="hist-summary-value">{formatBRL(avgPerRound)}</span>
      </div>
      {bestRound ? (
        <div className="hist-summary-best">
          <span className="hist-summary-label">Melhor round</span>
          <div className="hist-summary-best-row">
            <span className="hist-summary-best-value">{formatBRL(bestRound.totalRaised || 0)}</span>
            <span className="hist-summary-best-date">{relativeDate(bestRound.archivedAt)}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function GenreWidget({ genres, mediaWord }) {
  if (!genres.length) return null
  const max = genres[0].total || 1
  return (
    <div className="hist-widget">
      <p className="hist-widget-title">Estilo de {mediaWord}s no leilão</p>
      <div className="hist-genre-list">
        {genres.slice(0, 6).map((g) => (
          <div className="hist-genre-row" key={g.genre}>
            <div className="hist-genre-row-head">
              <span className="hist-genre-label">{g.genre}</span>
              <span className="hist-genre-value">{formatBRL(g.total)}</span>
            </div>
            <div className="hist-genre-track">
              <div className="hist-genre-fill" style={{ width: `${Math.max(6, Math.round((g.total / max) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RoundRow({ round, mediaWord }) {
  const winner = round.topGames && round.topGames[0]
  const rest = (round.topGames || []).slice(1, 6)
  const topDonors = round.topDonors || []

  return (
    <article className={`hist-round${round.openRound ? ' is-open' : ''}`}>
      <div className="hist-round-when">
        <span className="hist-round-date">{relativeDate(round.archivedAt)}</span>
        {round.durationMs ? <span className="hist-round-duration">{formatDuration(round.durationMs)}</span> : null}
        {round.openRound ? <span className="hist-round-tag">em andamento</span> : null}
      </div>

      <div className="hist-round-body">
        {winner ? (
          <div className="hist-round-winner">
            {winner.image ? (
              <img className="hist-round-winner-cover" src={winner.image} alt="" loading="lazy" />
            ) : (
              <div className="hist-round-winner-cover hist-round-cover-placeholder">{initial(winner.name)}</div>
            )}
            <div className="hist-round-winner-text">
              <span className="hist-round-winner-tag">vencedor</span>
              <span className="hist-round-winner-name">{winner.name}</span>
              <span className="hist-round-winner-total">{formatBRL(winner.total)}</span>
            </div>
          </div>
        ) : (
          <p className="hist-round-empty">Nenhum {mediaWord} recebeu apoio nesse round.</p>
        )}

        {rest.length ? (
          <div className="hist-round-roster">
            {rest.map((g) => (
              <div className="hist-round-roster-item" key={g.key} title={`${g.name} — ${formatBRL(g.total)}`}>
                {g.image ? (
                  <img src={g.image} alt="" loading="lazy" />
                ) : (
                  <span className="hist-round-cover-placeholder">{initial(g.name)}</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="hist-round-stats">
        <span className="hist-round-total">{round.totalRaised != null ? formatBRL(round.totalRaised) : 'oculto'}</span>
        <span className="hist-round-meta">
          {round.totalGames} {mediaWord}{round.totalGames === 1 ? '' : 's'} · {round.totalDonors} apoiador{round.totalDonors === 1 ? '' : 'es'}
        </span>
        {topDonors.length ? (
          <div className="hist-round-donors">
            <div className="hist-round-donor-avatars">
              {topDonors.slice(0, 3).map((d) => (
                d.avatar ? (
                  <img key={d.username} className="hist-round-donor-avatar" src={d.avatar} alt="" title={`${d.username} — ${formatBRL(d.total)}`} loading="lazy" />
                ) : (
                  <span key={d.username} className="hist-round-donor-avatar hist-round-donor-placeholder" title={`${d.username} — ${formatBRL(d.total)}`}>{initial(d.username)}</span>
                )
              ))}
            </div>
            <span className="hist-round-mvp">MVP {topDonors[0].username}</span>
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default function HistoricoStandalone({ leilaoId }) {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/l/${leilaoId}/recap/history`)
      .then((res) => res.json())
      .then((data) => setHistory(data.history || []))
      .catch(() => setError(true))
  }, [leilaoId])

  if (error) return <p className="empty-state">Não deu pra carregar o histórico agora.</p>
  if (!history) return <p className="hub-modal-loading">Carregando…</p>

  if (!history.length) {
    return (
      <>
        <div className="hub-header">
          <p className="hub-eyebrow">JogodaVez</p>
          <h1 className="hub-title">Histórico de leilões</h1>
        </div>
        <p className="empty-state">Nenhum leilão encerrado ainda.</p>
      </>
    )
  }

  const totalAllTime = history.reduce((sum, h) => sum + (h.totalRaised || 0), 0)
  const avgPerRound = totalAllTime / history.length
  const bestRound = history.reduce((best, h) => (!best || (h.totalRaised || 0) > (best.totalRaised || 0) ? h : best), null)

  const genreTotals = new Map()
  history.forEach((h) => {
    (h.genreBreakdown || []).forEach(({ genre, total }) => {
      genreTotals.set(genre, (genreTotals.get(genre) || 0) + total)
    })
  })
  const genres = [...genreTotals.entries()].map(([genre, total]) => ({ genre, total })).sort((a, b) => b.total - a.total)
  const mediaWord = mediaLabel(history[0].mode)

  return (
    <>
      <div className="hub-header">
        <p className="hub-eyebrow">JogodaVez</p>
        <h1 className="hub-title">Histórico de leilões</h1>
        <p className="hub-lede">Todos os seus rounds encerrados, do mais recente pro mais antigo -- não é uma disputa com outros streamers.</p>
      </div>
      <div className="hist-layout">
        <aside className="hist-sidebar">
          <SummaryCard totalAllTime={totalAllTime} roundCount={history.length} avgPerRound={avgPerRound} bestRound={bestRound} />
          <GenreWidget genres={genres} mediaWord={mediaWord} />
        </aside>
        <div className="hist-list">
          {history.map((round, i) => <RoundRow key={i} round={round} mediaWord={mediaLabel(round.mode)} />)}
        </div>
      </div>
    </>
  )
}
