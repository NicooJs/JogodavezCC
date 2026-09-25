import { useState } from 'react'
import { formatBRL, initial } from '../lib/format.js'
import { RankBadge, FlagIcon, TwitchIcon } from './icons.jsx'

function Thumb({ item }) {
  if (item.image) return <img className="lot-thumb" src={item.image} alt="" loading="lazy" />
  return <div className="lot-thumb lot-thumb-placeholder"><TwitchIcon /></div>
}

export default function LotCard({
  item,
  barPct,
  changed,
  hitBadge,
  streakTier,
  firing,
  spark,
  duelRole,
  duelChallengerDeficit,
  mediaLabel,
  onContextMenu,
  cardRef,
  onEdit,
  onDragStateChange,
  onDrop,
}) {
  const streakActive = streakTier > 0
  const isDuelDefender = duelRole === 'defender'
  const isDuelChallenger = duelRole === 'challenger'
  // a tag/barra de corrida sinaliza "não pode mais ser sabotado", não
  // "só classificou por bônus" -- por isso mostra em QUALQUER lote que
  // trava (raceLocked), seja ele vencedor natural por dinheiro ou não.
  // Pedido explícito do cliente: a trava precisa aparecer no instante em
  // que qualquer lote bate a meta, pra avisar que ele não corre mais risco
  // de sabotagem -- inclusive o líder. Mostra também em quem tá perto
  // (65%+, mesmo limiar do duelo) MAS AINDA NÃO bateu a meta -- ainda tem
  // chance real de vaga. Uma vez que bateu a meta sem conseguir vaga
  // (raceGoalReached mas não raceLocked, teto de vagas já esgotado por
  // quem chegou antes), some com a barra -- não tem mais chance nenhuma
  // ali, mostrar "meta batida, mas sem vaga sobrando" só deixava o card
  // parecendo classificado sem estar (pedido explícito do cliente).
  const raceProgress = item.raceGoal ? item.total / item.raceGoal : 0
  const showRaceUi = !!item.raceGoal && (item.raceLocked || (!item.raceGoalReached && raceProgress >= 0.65))
  const [dragging, setDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState(false)

  return (
    <div
      ref={cardRef}
      className={`lot-card rank-${item.rank}${streakActive ? ' is-streaking' : ''}${isDuelDefender ? ' is-duel-defender' : ''}${isDuelChallenger ? ' is-duel-challenger' : ''}${dragging ? ' dragging' : ''}${dropTarget ? ' drop-target' : ''}${firing ? ' is-firing' : ''}`}
      style={{ '--pct': `${barPct}%` }}
      data-streak-tier={streakActive ? streakTier : undefined}
      draggable
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault()
              onContextMenu(e.clientX, e.clientY, item)
            }
          : undefined
      }
      onDragStart={(e) => {
        if (!document.body.classList.contains('presenter-mode')) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.key)
        setDragging(true)
        onDragStateChange?.(item.key)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropTarget(true)
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropTarget(false)
        const fromKey = e.dataTransfer.getData('text/plain')
        if (fromKey && fromKey !== item.key) onDrop?.(fromKey, item.key)
      }}
      onDragEnd={() => {
        setDragging(false)
        onDragStateChange?.(null)
      }}
    >
      {item.image ? <div className="lot-card-bg" style={{ backgroundImage: `url('${item.image}')` }} /> : null}
      <div className="lot-card-fill" />
      {isDuelDefender ? <span className="duel-glow" data-role="defender" aria-hidden="true" /> : null}
      {isDuelChallenger ? <span className="duel-glow" data-role="challenger" aria-hidden="true" /> : null}
      <div className="lot-card-content">
        <span className="lot-rank">
          <RankBadge rank={item.rank} />
        </span>
        <Thumb item={item} />
        <div className="lot-info">
          <p className="lot-name">{item.name}</p>
          {showRaceUi ? (
            <div className={`lot-race lot-race-live${item.raceLocked ? ' is-reached' : ''}`}>
              <span className="lot-race-value">{formatBRL(item.total)}</span>
              <div className="lot-race-track">
                <div
                  className="lot-race-fill"
                  style={{ width: `${item.raceLocked ? 100 : Math.max(0, Math.min(100, Math.round((item.total / item.raceGoal) * 100)))}%` }}
                />
              </div>
              <span className="lot-race-value lot-race-value-goal">
                {item.raceLocked ? <FlagIcon /> : formatBRL(item.raceGoal)}
              </span>
            </div>
          ) : (
            <span className={`lot-total${changed ? ' tick' : ''}${item.total < 0 ? ' lot-total-negative' : ''}`}>
              {formatBRL(item.total)}
            </span>
          )}
          {!showRaceUi && (item.added > 0 || item.removed > 0) ? (
            <div className="lot-funding">
              {item.added > 0 ? <span className="lot-funding-add">+{formatBRL(item.added)}</span> : null}
              {item.removed > 0 ? <span className="lot-funding-remove">−{formatBRL(item.removed)}</span> : null}
            </div>
          ) : null}
          {!showRaceUi && item.topDonor && item.topDonor.username ? (
            <div className="lot-top-donor" title={`Quem mais apoiou este ${mediaLabel}`}>
              {item.topDonor.avatar ? (
                <img className="lot-top-donor-avatar" src={item.topDonor.avatar} alt="" loading="lazy" />
              ) : (
                <span className="lot-top-donor-avatar lot-top-donor-avatar-placeholder">{initial(item.topDonor.username)}</span>
              )}
              <span className="lot-top-donor-name">{item.topDonor.username}</span>
            </div>
          ) : null}
        </div>
        {showRaceUi ? (
          <div className="lot-extras">
            <span className={`lot-total${changed ? ' tick' : ''}${item.total < 0 ? ' lot-total-negative' : ''}`}>
              {formatBRL(item.total)}
            </span>
            {item.added > 0 || item.removed > 0 ? (
              <div className="lot-funding">
                {item.added > 0 ? <span className="lot-funding-add">+{formatBRL(item.added)}</span> : null}
                {item.removed > 0 ? <span className="lot-funding-remove">−{formatBRL(item.removed)}</span> : null}
              </div>
            ) : null}
            {item.topDonor && item.topDonor.username ? (
              <div className="lot-top-donor" title={`Quem mais apoiou este ${mediaLabel}`}>
                {item.topDonor.avatar ? (
                  <img className="lot-top-donor-avatar" src={item.topDonor.avatar} alt="" loading="lazy" />
                ) : (
                  <span className="lot-top-donor-avatar lot-top-donor-avatar-placeholder">{initial(item.topDonor.username)}</span>
                )}
                <span className="lot-top-donor-name">{item.topDonor.username}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="lot-corner">
        {item.qualifiedByRace ? (
          <span className="badge-race-qualified" title="Classificado pela meta da corrida, não pelo valor">
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2.5v15" /><path d="M4 3.5c2-1 3.5 1 5.5 0s3.5-1 5.5 0v6c-2-1-3.5 1-5.5 0s-3.5-1-5.5 0z" /></svg>
            classificado
          </span>
        ) : null}
        {streakActive ? <span className="badge-streak" data-tier={streakTier}>×{item.combo.count}</span> : null}
        {isDuelDefender ? <span className="badge-duel" data-role="defender">defendendo a vaga</span> : null}
        {isDuelChallenger ? (
          <span className="badge-duel" data-role="challenger">faltam {formatBRL(duelChallengerDeficit)}</span>
        ) : null}
        {hitBadge}
        <div className="lot-edit">
          <button type="button" aria-label={`Editar ${item.name}`} title="Editar" onClick={() => onEdit?.(item)}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3.5l3.5 3.5L6.5 17 2.5 17.5 3 13.5 13 3.5z" /><path d="M11.3 5.2l3.5 3.5" /></svg>
          </button>
        </div>
      </div>
      {item.likes > 0 || item.dislikes > 0 ? (
        <div className="lot-reactions">
          {item.likes > 0 ? (
            <div className={`lot-likes${spark ? ' is-sparking' : ''}`} title={`${item.likes} hype no chat da Twitch`}>
              <svg className="icon" viewBox="0 0 20 20" fill="currentColor" stroke="none" aria-hidden="true"><path d="M10 17.3l-1.1-1C4.4 12.4 2 10.2 2 7.4 2 5.2 3.7 3.5 5.9 3.5c1.3 0 2.6.6 3.4 1.6.8-1 2.1-1.6 3.4-1.6C15 3.5 16.7 5.2 16.7 7.4c0 2.8-2.4 5-6.9 8.9l-.8.7z" /></svg>
              <span>{item.likes}</span>
              {spark ? (
                <svg className="icon lot-hype-spark" viewBox="0 0 20 20" fill="currentColor" stroke="none" aria-hidden="true"><path d="M10 1.5c.6 2.4-.6 3.6-1.8 4.9C7 7.6 5.8 9 5.8 11.2a4.2 4.2 0 008.4 0c0-1.3-.5-2.2-1.1-3 .6 2-.4 3.3-1.6 3.3-1 0-1.7-.7-1.7-1.7 0-1 .8-1.5 1.3-2.3.8-1.2.9-2.9-1.1-6z" /></svg>
              ) : null}
            </div>
          ) : null}
          {item.dislikes > 0 ? (
            <div className="lot-dislikes" title={`${item.dislikes} dislike no chat da Twitch`}>
              <svg className="icon" viewBox="0 0 20 20" fill="currentColor" stroke="none" aria-hidden="true"><rect x="5.5" y="3" width="9" height="6.5" rx="1.2" /><rect x="6" y="9" width="4.5" height="7.5" rx="2.25" transform="rotate(20 8.25 9)" /></svg>
              <span>{item.dislikes}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {firing ? (
        <div className="lot-firing-flame" aria-hidden="true">
          <svg className="icon" viewBox="0 0 20 20" fill="currentColor" stroke="none"><path d="M10 1.5c.6 2.4-.6 3.6-1.8 4.9C7 7.6 5.8 9 5.8 11.2a4.2 4.2 0 008.4 0c0-1.3-.5-2.2-1.1-3 .6 2-.4 3.3-1.6 3.3-1 0-1.7-.7-1.7-1.7 0-1 .8-1.5 1.3-2.3.8-1.2.9-2.9-1.1-6z" /></svg>
        </div>
      ) : null}
    </div>
  )
}
