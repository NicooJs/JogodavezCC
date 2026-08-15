import { initial } from '../lib/format.js'

function sortByUpdatedAt(videos) {
  return [...videos].sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0))
}

function QueueThumb({ video }) {
  if (video.thumbnail) return <div className="reacts-queue-thumb" style={{ backgroundImage: `url("${video.thumbnail}")` }} />
  return <div className="reacts-queue-thumb reacts-queue-thumb-placeholder">{initial(video.title)}</div>
}

function QueueItem({ video, position, isNext, onContextMenu }) {
  const pct = video.goalCents > 0 ? Math.max(0, Math.min(100, Math.round((video.totalCents / video.goalCents) * 100))) : 0
  return (
    <li
      className={`reacts-queue-item${isNext ? ' is-next' : ''}`}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault()
              onContextMenu(e.clientX, e.clientY, video)
            }
          : undefined
      }
    >
      <span className="reacts-queue-pos">{position}</span>
      <QueueThumb video={video} />
      <div className="reacts-queue-body">
        <p className="reacts-queue-title" title={video.title || ''}>{video.title || 'Vídeo sem título'}</p>
        <p className="reacts-queue-submitter">{video.submittedBy || 'Anônimo'}</p>
        <div className="reacts-queue-track"><div className="reacts-queue-fill" style={{ width: `${pct}%` }} /></div>
        <p className="reacts-queue-value">
          <b>{((video.totalCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b>
          {' de '}
          {((video.goalCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
      </div>
    </li>
  )
}

export default function ReactsQueue({ leaderboard, hidden, onVideoContextMenu }) {
  const queue = sortByUpdatedAt((leaderboard.reactVideos || []).filter((v) => v.status === 'unlocked'))
  const rest = queue.slice(1)
  const history = [...(leaderboard.reactedVideos || [])].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))

  return (
    <section className="panel reacts-queue-panel" hidden={hidden}>
      <p className="reacts-rail-title">
        na fila
        <span className="reacts-rail-count">{rest.length}</span>
      </p>
      {rest.length ? (
        <ul className="reacts-queue-list">
          {rest.map((video, i) => (
            <QueueItem video={video} position={i + 2} isNext={i === 0} onContextMenu={onVideoContextMenu} key={video.id} />
          ))}
        </ul>
      ) : (
        <p className="empty-state">Nenhum vídeo esperando na fila.</p>
      )}
      {history.length ? (
        <div className="reacts-history-section">
          <p className="reacts-history-label">já reagidos</p>
          <ul className="reacts-queue-list is-history">
            {history.map((video) => (
              <QueueItem video={video} position="✓" isNext={false} key={video.id} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
