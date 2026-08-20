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

function ProfileBanner({ profile, onRefresh, refreshing }) {
  const since = profile?.connectedAt
    ? new Date(profile.connectedAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    : null

  return (
    <div className="hist-banner">
      <div className="hist-banner-bg" aria-hidden="true" />
      <div className="hist-banner-content">
        {profile?.avatarUrl ? (
          <img className="hist-banner-avatar" src={profile.avatarUrl} alt="" />
        ) : (
          <div className="hist-banner-avatar" />
        )}
        <div className="hist-banner-text">
          <p className="hist-banner-name">{profile?.displayName || profile?.twitchLogin || ''}</p>
          <p className="hist-banner-login">
            {profile?.twitchLogin ? `@${profile.twitchLogin}` : ''}
            {since ? <span className="hist-banner-since">streamer desde {since}</span> : null}
          </p>
        </div>
        <button className="hist-banner-refresh" type="button" onClick={onRefresh} disabled={refreshing}>
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16 3v4h-4" /></svg>
          Atualizar
        </button>
      </div>
    </div>
  )
}

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'filmes', label: 'Filmes' },
]

function FilterTabs({ filter, setFilter, counts }) {
  return (
    <div className="hist-filter-tabs" role="tablist">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={filter === f.id}
          className={`hist-filter-tab${filter === f.id ? ' active' : ''}`}
          onClick={() => setFilter(f.id)}
        >
          {f.label}
          <span className="hist-filter-count">{counts[f.id] || 0}</span>
        </button>
      ))}
    </div>
  )
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
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('todos')

  const load = () => {
    return Promise.all([
      fetch(`/api/l/${leilaoId}/recap/history`).then((res) => res.json()),
      fetch('/api/perfil').then((res) => (res.ok ? res.json() : null)).catch(() => null),
    ]).then(([historyData, profileData]) => {
      setHistory(historyData.history || [])
      setProfile(profileData)
    })
  }

  useEffect(() => {
    load().catch(() => setError(true))
  }, [leilaoId])

  const onRefresh = () => {
    setRefreshing(true)
    load().catch(() => setError(true)).finally(() => setRefreshing(false))
  }

  if (error) return <p className="empty-state">Não deu pra carregar o histórico agora.</p>
  if (!history) return <p className="hub-modal-loading">Carregando…</p>

  const counts = {
    todos: history.length,
    jogos: history.filter((h) => mediaLabel(h.mode) === 'jogo').length,
    filmes: history.filter((h) => mediaLabel(h.mode) === 'filme').length,
  }
  const filtered = filter === 'todos' ? history : history.filter((h) => mediaLabel(h.mode) === (filter === 'jogos' ? 'jogo' : 'filme'))

  const totalAllTime = filtered.reduce((sum, h) => sum + (h.totalRaised || 0), 0)
  const avgPerRound = filtered.length ? totalAllTime / filtered.length : 0
  const bestRound = filtered.reduce((best, h) => (!best || (h.totalRaised || 0) > (best.totalRaised || 0) ? h : best), null)

  const genreTotals = new Map()
  filtered.forEach((h) => {
    (h.genreBreakdown || []).forEach(({ genre, total }) => {
      genreTotals.set(genre, (genreTotals.get(genre) || 0) + total)
    })
  })
  const genres = [...genreTotals.entries()].map(([genre, total]) => ({ genre, total })).sort((a, b) => b.total - a.total)
  const mediaWord = mediaLabel((filtered[0] || history[0]).mode)

  return (
    <div className="hist-page">
      <ProfileBanner profile={profile} onRefresh={onRefresh} refreshing={refreshing} />
      <FilterTabs filter={filter} setFilter={setFilter} counts={counts} />

      {filtered.length === 0 ? (
        <p className="empty-state">Nenhum round encerrado nessa categoria ainda.</p>
      ) : (
        <div className="hist-layout">
          <aside className="hist-sidebar">
            <SummaryCard totalAllTime={totalAllTime} roundCount={filtered.length} avgPerRound={avgPerRound} bestRound={bestRound} />
            <GenreWidget genres={genres} mediaWord={mediaWord} />
          </aside>
          <div className="hist-list">
            {filtered.map((round, i) => <RoundRow key={i} round={round} mediaWord={mediaLabel(round.mode)} />)}
          </div>
        </div>
      )}
    </div>
  )
}
