import { useMemo, useState } from 'react'
import { formatBRL, initial } from '../lib/format.js'

function historyLabel(event) {
  if (event.type === 'add' || event.type === 'manual') {
    return {
      node: (
        <>
          <span className="who">{event.username || 'Anônimo'}</span> apoiou{' '}
          <strong>{event.game ? event.game.name : ''}</strong>
        </>
      ),
      dot: 'dot-add',
      amtClass: 'amt-add',
    }
  }
  if (event.type === 'remove') {
    return {
      node: (
        <>
          <span className="who">{event.username || 'Anônimo'}</span> tirou pontos de{' '}
          <strong>{event.game ? event.game.name : ''}</strong>
        </>
      ),
      dot: 'dot-remove',
      amtClass: 'amt-remove',
    }
  }
  if (event.type === 'pending') {
    return {
      node: (
        <>
          <span className="who">{event.username || 'Anônimo'}</span> doou, aguardando identificação
        </>
      ),
      dot: 'dot-pending',
      amtClass: 'amt-pending',
    }
  }
  if (event.type === 'ignored') {
    return {
      node: (
        <>
          <span className="who">{event.username || 'Anônimo'}</span> doou sem indicar um lote
        </>
      ),
      dot: '',
      amtClass: '',
    }
  }
  if (event.type === 'closed') {
    return {
      node: (
        <>
          <span className="who">{event.username || 'Anônimo'}</span> doou (leilão encerrado, não contabilizado)
        </>
      ),
      dot: '',
      amtClass: '',
    }
  }
  return null
}

function HistoryBadge({ dotClass }) {
  if (dotClass === 'dot-add') {
    return (
      <span className="history-badge badge-add">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3M3 6l3-3 3 3" /></svg>
      </span>
    )
  }
  if (dotClass === 'dot-remove') {
    return (
      <span className="history-badge badge-remove">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v6M3 6l3 3 3-3" /></svg>
      </span>
    )
  }
  if (dotClass === 'dot-pending') {
    return (
      <span className="history-badge badge-pending">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v3l2 2" /><circle cx="6" cy="6" r="4.3" /></svg>
      </span>
    )
  }
  return null
}

const SORT_CYCLE = { recent: 'high', high: 'low', low: 'recent' }
const SORT_LABELS = { recent: 'recentes', high: 'maior valor', low: 'menor valor' }

export default function HistoryPanel({ items, hidden }) {
  const [sortMode, setSortMode] = useState('recent')

  const sorted = useMemo(() => {
    if (sortMode === 'high') return [...items].sort((a, b) => (b.amount || 0) - (a.amount || 0))
    if (sortMode === 'low') return [...items].sort((a, b) => (a.amount || 0) - (b.amount || 0))
    return items
  }, [items, sortMode])

  const rows = sorted.slice(0, 50).map((event, index) => {
    const info = historyLabel(event)
    if (!info) return null
    const time = event.time ? new Date(event.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
    return (
      <li key={event.eventId || `${event.time}-${index}`}>
        <div className="history-avatar-wrap">
          {event.avatar ? (
            <img className="history-avatar" src={event.avatar} alt="" loading="lazy" />
          ) : (
            <span className="history-avatar history-avatar-placeholder">{initial(event.username)}</span>
          )}
          <HistoryBadge dotClass={info.dot} />
        </div>
        <div className="history-body">
          <span className="history-text">{info.node}</span>
          <div className="history-meta">
            <span className="history-time">{time}</span>
            {info.amtClass ? <span className={`history-amt ${info.amtClass}`}>{formatBRL(event.amount || 0)}</span> : null}
          </div>
        </div>
      </li>
    )
  })

  return (
    <section className="panel history-panel" id="history-panel" hidden={hidden}>
      <p className="panel-label panel-label-icon" title="Histórico">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 5.5V10l3 2" /><circle cx="10" cy="10" r="7" /></svg>
        <span className="sr-only">Histórico</span>
        <button
          className={`history-sort-btn${sortMode !== 'recent' ? ' active' : ''}`}
          type="button"
          title="Ordenar por valor"
          onClick={() => setSortMode(SORT_CYCLE[sortMode])}
        >
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4v12M6 16l-3-3M6 16l3-3" /><path d="M14 16V4M14 4l-3 3M14 4l3 3" /></svg>
          <span>{SORT_LABELS[sortMode]}</span>
        </button>
      </p>
      <ul className="history-list" id="history-list">
        {items.length === 0 ? <li className="empty-state">Ainda não teve nenhum lance.</li> : rows}
      </ul>
    </section>
  )
}
