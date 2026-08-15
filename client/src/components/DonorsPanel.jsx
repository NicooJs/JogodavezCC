import { formatBRL, initial } from '../lib/format.js'
import { RankBadge } from './icons.jsx'

export default function DonorsPanel({ donors, totalRaised }) {
  const [leader, ...rest] = donors
  const maxTotal = Math.max(...rest.map((d) => d.total), 1)
  const dominance =
    leader && totalRaised > 0 ? Math.max(2, Math.min(100, Math.round((leader.total / totalRaised) * 100))) : null

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
          <div className="donor-leader">
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
            <div className={`donor-row rank-${d.rank}`} style={{ '--pct': `${pct}%` }} key={d.username + d.rank}>
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
    </section>
  )
}
