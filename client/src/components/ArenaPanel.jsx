import { Fragment, useEffect, useRef, useState } from 'react'
import LotCard from './LotCard.jsx'
import { mediaLabel } from '../lib/media.js'
import { initial } from '../lib/format.js'
import { triggerConfettiBurst } from '../lib/effects.js'

function streakTier(count) {
  if (count >= 7) return 3
  if (count >= 4) return 2
  return 1
}

function reactThumb(video, baseClass) {
  if (video.thumbnail) return <img className={baseClass} src={video.thumbnail} alt="" loading="lazy" />
  return <div className={`${baseClass}-placeholder`}>{initial(video.title)}</div>
}

function ReactGoal({ video }) {
  const goal = video.goal || 0
  const total = video.total || 0
  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((total / goal) * 100))) : 0
  return (
    <div className="react-goal">
      <div className="react-goal-track">
        <div className="react-goal-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="react-goal-label">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 7.5v5l4.5-2.5-4.5-2.5z" fill="currentColor" stroke="none" />
          <path d="M13 6.8a4 4 0 0 1 0 6.4M15.3 4.5a7.5 7.5 0 0 1 0 11" />
        </svg>
        {goal > 0 ? `faltam ${(Math.max(0, goal - total)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} pra liberar` : 'aguardando meta'}
      </span>
    </div>
  )
}

function ReactCatalog({ videos }) {
  const inProgress = videos.filter((v) => v.status === 'active')
  if (inProgress.length === 0) {
    return (
      <p className="empty-state arena-empty">
        <span className="arena-empty-title">Nenhum vídeo em andamento</span>
        Assim que um vídeo aprovado receber doação, ele aparece aqui.
      </p>
    )
  }
  const sorted = [...inProgress].sort((a, b) => {
    const pctA = a.goal > 0 ? a.total / a.goal : 0
    const pctB = b.goal > 0 ? b.total / b.goal : 0
    return pctB - pctA
  })
  const [featured, ...rest] = sorted
  return (
    <>
      <div className="react-featured" data-video-id={featured.id}>
        {reactThumb(featured, 'react-featured-thumb')}
        <div className="react-featured-body">
          <p className="react-featured-title" title={featured.title || ''}>{featured.title || 'Vídeo sem título'}</p>
          <span className="react-featured-submitter">sugerido por {featured.submittedBy || 'Anônimo'}</span>
          <ReactGoal video={featured} />
        </div>
      </div>
      {rest.length ? (
        <div className="react-grid">
          {rest.map((video) => (
            <div className="react-card" data-video-id={video.id} key={video.id}>
              {reactThumb(video, 'react-card-thumb')}
              <div className="react-card-body">
                <p className="react-card-title" title={video.title || ''}>{video.title || 'Vídeo sem título'}</p>
                <span className="react-card-submitter">sugerido por {video.submittedBy || 'Anônimo'}</span>
                <ReactGoal video={video} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}

export default function ArenaPanel({ leaderboard, lastEvent, onLotContextMenu, onEditLot, onMergeLots }) {
  const isReacts = leaderboard.activeSystem === 'reacts'
  const items = leaderboard.items || []
  const qualifyCount = leaderboard.qualifyCount || 3

  const previousTotals = useRef(new Map())
  const [changedKeys, setChangedKeys] = useState(new Set())
  const [flash, setFlash] = useState(null)
  const flashTimer = useRef(null)
  const cardNodes = useRef(new Map())

  useEffect(() => {
    const next = new Map()
    const changed = new Set()
    items.forEach((item) => {
      next.set(item.key, item.total)
      if (previousTotals.current.has(item.key) && previousTotals.current.get(item.key) !== item.total) {
        changed.add(item.key)
      }
    })
    previousTotals.current = next
    setChangedKeys(changed)
  }, [items])

  useEffect(() => {
    if (!lastEvent || (lastEvent.type !== 'add' && lastEvent.type !== 'remove') || !lastEvent.game) return
    clearTimeout(flashTimer.current)
    setFlash({ key: lastEvent.game.key, type: lastEvent.type })
    flashTimer.current = setTimeout(() => setFlash(null), 4000)

    if ((lastEvent.amount || 0) > 100) {
      const node = cardNodes.current.get(lastEvent.game.key)
      if (node) {
        const isAdd = lastEvent.type === 'add'
        triggerConfettiBurst(node.getBoundingClientRect(), {
          colors: isAdd
            ? ['var(--accent)', 'var(--accent-text)', 'var(--positive)', 'var(--silver)']
            : ['var(--danger)', '#ff8fa8', 'var(--muted)'],
          count: isAdd ? 40 : 26,
          spark: !isAdd,
          spreadY: 30,
        })
      }
    }
    return () => clearTimeout(flashTimer.current)
  }, [lastEvent])

  let duelDefender = null
  let duelChallenger = null
  if (items.length > qualifyCount) {
    const defenderCandidate = items.find((i) => i.rank === qualifyCount) || null
    const challengerCandidate = items.find((i) => i.rank === qualifyCount + 1) || null
    if (defenderCandidate && challengerCandidate && defenderCandidate.total > 0) {
      const ratio = challengerCandidate.total / defenderCandidate.total
      if (ratio >= 0.65) {
        duelDefender = defenderCandidate
        duelChallenger = challengerCandidate
      }
    }
  }

  const maxTotal = Math.max(...items.map((i) => i.total), 1)
  const label = isReacts ? 'Vídeos pra reagir' : `Catálogo do ${mediaLabel(leaderboard.mode)}`

  return (
    <section className="panel arena-panel">
      <p className="panel-label panel-label-icon" title={label}>
        {isReacts ? (
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" /><path d="M8.2 8.1l4 2.1-4 2.1V8.1z" fill="currentColor" stroke="none" /><path d="M6 17h8" /></svg>
        ) : (
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="6" height="6" rx="1" /><rect x="11.5" y="4" width="6" height="6" rx="1" /><rect x="2.5" y="12" width="6" height="4" rx="1" /><rect x="11.5" y="12" width="6" height="4" rx="1" /></svg>
        )}
        <span className="sr-only">{label}</span>
        <span className="panel-count">{isReacts ? leaderboard.reactVideos.filter((v) => v.status === 'active').length : items.length}</span>
      </p>
      <div className="arena-grid">
        {isReacts ? (
          <ReactCatalog videos={leaderboard.reactVideos || []} />
        ) : items.length === 0 ? (
          <p className="empty-state arena-empty">
            <span className="arena-empty-title">Catálogo vazio</span>
            O primeiro lance abre a disputa.
          </p>
        ) : (
          items.map((item, index) => {
            const barPct = item.total > 0 ? Math.max(3, Math.round((item.total / maxTotal) * 100)) : 0
            const combo = item.combo
            const streakActive = !!combo && combo.count >= 2 && combo.expiresAt > Date.now()
            const isFlashingSabotage = flash && flash.key === item.key && flash.type === 'remove'
            const hitBadge = isFlashingSabotage ? (
              <span className="badge-hit">sabotado agora</span>
            ) : item.key === leaderboard.lastSabotagedKey ? (
              <span className="badge-hit badge-hit-last">último sabotado</span>
            ) : null
            const duelRole =
              duelDefender && item.key === duelDefender.key
                ? 'defender'
                : duelChallenger && item.key === duelChallenger.key
                  ? 'challenger'
                  : null
            const isQualifyBoundary = item.rank === qualifyCount && items.length > qualifyCount
            return (
              <Fragment key={item.key}>
                <LotCard
                  item={item}
                  barPct={barPct}
                  changed={changedKeys.has(item.key)}
                  hitBadge={hitBadge}
                  streakTier={streakActive ? streakTier(combo.count) : 0}
                  duelRole={duelRole}
                  duelChallengerDeficit={duelChallenger && item.key === duelChallenger.key ? duelDefender.total - item.total : 0}
                  mediaLabel={mediaLabel(leaderboard.mode)}
                  onContextMenu={onLotContextMenu}
                  onEdit={onEditLot}
                  onDrop={onMergeLots}
                  cardRef={(node) => {
                    if (node) cardNodes.current.set(item.key, node)
                    else cardNodes.current.delete(item.key)
                  }}
                />
                {isQualifyBoundary ? (
                  <div className={`qualify-divider${duelDefender && duelChallenger ? ' is-duel' : ''}`}>
                    <span>{duelDefender && duelChallenger ? 'disputa pela última vaga' : 'classificados até aqui'}</span>
                  </div>
                ) : null}
              </Fragment>
            )
          })
        )}
      </div>
    </section>
  )
}
