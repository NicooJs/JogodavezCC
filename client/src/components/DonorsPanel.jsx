import { useEffect, useRef, useState } from 'react'
import { formatBRL, initial } from '../lib/format.js'
import { RankBadge } from './icons.jsx'

export default function DonorsPanel({ donors, totalRaised, onMergeDonors, lastEvent }) {
  const [leader, ...rest] = donors
  const maxTotal = Math.max(...rest.map((d) => d.total), 1)
  const dominance =
    leader && totalRaised > 0 ? Math.max(2, Math.min(100, Math.round((leader.total / totalRaised) * 100))) : null

  // toast de 5s "fulano deu hype/dislike em tal jogo" no rodapé do painel
  // (pedido explícito do cliente, versão detalhada com foto + fechar
  // manual -- a primeira versão era só texto pequeno) -- reage a QUALQUER
  // !hype/!dislike aceito no chat da Twitch, não só o marco de 5 (esse
  // marco só decide a chama grande no card, ver ArenaPanel.jsx)
  const [reactionToast, setReactionToast] = useState(null)
  const reactionTimer = useRef(null)
  const dismissReactionToast = () => {
    clearTimeout(reactionTimer.current)
    setReactionToast(null)
  }
  useEffect(() => {
    if (!lastEvent || (lastEvent.type !== 'hype' && lastEvent.type !== 'dislike') || !lastEvent.game) return
    clearTimeout(reactionTimer.current)
    setReactionToast({
      type: lastEvent.type,
      gameName: lastEvent.game.name,
      by: lastEvent.game.by || 'alguém',
      avatar: lastEvent.game.byAvatar || null,
      count: lastEvent.type === 'hype' ? lastEvent.game.likes : lastEvent.game.dislikes,
    })
    reactionTimer.current = setTimeout(() => setReactionToast(null), 5000)
    return () => clearTimeout(reactionTimer.current)
  }, [lastEvent])

  // arrastar um apoiador sobre outro mescla os dois (mesmo apoiador digitou
  // o nome diferente em 2 doações) -- só ativo em modo apresentador
  // (onMergeDonors vem undefined pro público/moderador sem acesso)
  const [draggingUsername, setDraggingUsername] = useState(null)
  const [dropTargetUsername, setDropTargetUsername] = useState(null)
  const dragProps = (username) =>
    onMergeDonors && username // "Anônimo" (username vazio) não é uma pessoa só pra mesclar
      ? {
          draggable: true,
          onDragStart: (e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', username)
            setDraggingUsername(username)
          },
          onDragOver: (e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropTargetUsername(username)
          },
          onDragLeave: () => setDropTargetUsername(null),
          onDrop: (e) => {
            e.preventDefault()
            setDropTargetUsername(null)
            const from = e.dataTransfer.getData('text/plain')
            if (from && from !== username) onMergeDonors(from, username)
          },
          onDragEnd: () => setDraggingUsername(null),
        }
      : {}
  const dragClass = (username) =>
    `${draggingUsername === username ? ' dragging' : ''}${dropTargetUsername === username ? ' drop-target' : ''}`

  return (
    <section className="panel donors-panel">
      <p className="panel-label panel-label-icon" title="Quadro de honra">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 4h8v3.5a4 4 0 0 1-8 0V4z" />
          <path d="M6 5H3.5A1.5 1.5 0 0 0 2 6.5v0A2.5 2.5 0 0 0 4.5 9H6M14 5h2.5A1.5 1.5 0 0 1 18 6.5v0A2.5 2.5 0 0 1 15.5 9H14" />
          <path d="M10 11.5V14" />
          <path d="M7 16.5h6" />
          <path d="M8 14h4l.6 2.5H7.4L8 14z" />
        </svg>
        <span className="sr-only">Quadro de honra</span>
        <span className="panel-count">{donors.length}</span>
      </p>
      <div className="donor-list">
        {donors.length === 0 ? <p className="empty-state">Ainda sem apoiadores.</p> : null}
        {leader ? (
          <div className={`donor-leader${dragClass(leader.username)}`} {...dragProps(leader.username)}>
            <div className="donor-leader-avatar-wrap">
              {leader.avatar ? (
                <img className="donor-leader-avatar" src={leader.avatar} alt="" loading="lazy" />
              ) : (
                <span className="donor-leader-avatar donor-avatar-placeholder">{initial(leader.username)}</span>
              )}
              <span className="donor-leader-badge">01</span>
            </div>
            <div className="donor-leader-data">
              <span className="donor-leader-name">
                {leader.username || 'Anônimo'}
                <svg className="donor-leader-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.3l-6.3 3.9 1.7-6.9L2 9.7l7.1-.6L12 2.5z" />
                </svg>
              </span>
              <span className="donor-leader-total">{formatBRL(leader.total)}</span>
              {dominance !== null ? (
                <div className="donor-dominance">
                  <span className="donor-dominance-label">
                    domínio <b>{dominance}%</b>
                  </span>
                  <div className="donor-dominance-bar">
                    <i style={{ width: `${dominance}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {rest.map((d) => {
          const pct = d.total > 0 ? Math.max(4, Math.round((d.total / maxTotal) * 100)) : 0
          return (
            <div
              className={`donor-row rank-${d.rank}${dragClass(d.username)}`}
              style={{ '--pct': `${pct}%` }}
              key={d.username + d.rank}
              {...dragProps(d.username)}
            >
              <div className="donor-row-fill" />
              <span className="donor-rank">
                <RankBadge rank={d.rank} />
              </span>
              {d.avatar ? (
                <img className="donor-avatar" src={d.avatar} alt="" loading="lazy" />
              ) : (
                <span className="donor-avatar donor-avatar-placeholder">{initial(d.username)}</span>
              )}
              <span className="donor-name">{d.username || 'Anônimo'}</span>
              <span className="donor-total">{formatBRL(d.total)}</span>
            </div>
          )
        })}
      </div>
      {reactionToast ? (
        <div className={`donor-reaction-toast is-${reactionToast.type}`}>
          {reactionToast.avatar ? (
            <img className="donor-reaction-toast-avatar" src={reactionToast.avatar} alt="" loading="lazy" />
          ) : (
            <span className="donor-reaction-toast-avatar donor-avatar-placeholder">{initial(reactionToast.by)}</span>
          )}
          <div className="donor-reaction-toast-body">
            <span className="donor-reaction-toast-name">{reactionToast.by}</span>
            <span className="donor-reaction-toast-action">
              {reactionToast.type === 'hype' ? (
                <svg className="icon" viewBox="0 0 20 20" fill="currentColor" stroke="none" aria-hidden="true"><path d="M10 17.3l-1.1-1C4.4 12.4 2 10.2 2 7.4 2 5.2 3.7 3.5 5.9 3.5c1.3 0 2.6.6 3.4 1.6.8-1 2.1-1.6 3.4-1.6C15 3.5 16.7 5.2 16.7 7.4c0 2.8-2.4 5-6.9 8.9l-.8.7z" /></svg>
              ) : (
                <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 11V3.5h7.2c1 0 1.8.8 1.6 1.8l-.9 5.5c-.1.7-.7 1.2-1.5 1.2H6z" /><path d="M6 11l-2.3 4.5c-.5 1 .2 2 1.3 2 .6 0 1.2-.4 1.4-1l1.6-4v-1.5H6z" /></svg>
              )}
              deu {reactionToast.type === 'hype' ? 'hype' : 'dislike'} em <b>{reactionToast.gameName}</b>
              {reactionToast.count != null ? <i className="donor-reaction-toast-count">({reactionToast.count})</i> : null}
            </span>
          </div>
          <button type="button" className="donor-reaction-toast-close" aria-label="Fechar" onClick={dismissReactionToast}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
      ) : null}
    </section>
  )
}
