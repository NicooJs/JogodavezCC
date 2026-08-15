import { initial } from '../lib/format.js'

function QueueRow({ video, isHistory, onContextMenu }) {
  const meta = isHistory && video.updatedAt
    ? `${video.submittedBy || 'Anônimo'} · ${new Date(video.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : `sugerido por ${video.submittedBy || 'Anônimo'}`
  return (
    <div
      className={`react-queue-row${isHistory ? ' is-history' : ''}`}
      data-video-id={video.id}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault()
              onContextMenu(e.clientX, e.clientY, video)
            }
          : undefined
      }
    >
      {video.thumbnail ? (
        <img className="react-queue-thumb" src={video.thumbnail} alt="" loading="lazy" />
      ) : (
        <div className="react-queue-thumb-placeholder">{initial(video.title)}</div>
      )}
      <div className="react-queue-body">
        <p className="react-queue-title" title={video.title || ''}>{video.title || 'Vídeo sem título'}</p>
        <span className="react-queue-submitter">{meta}</span>
      </div>
    </div>
  )
}

export default function ReactPlaylistPanel({ queue, history, hidden, onVideoContextMenu }) {
  const sortedQueue = [...queue].sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0))
  const sortedHistory = [...history].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))

  return (
    <section className="panel react-playlist-panel" id="react-playlist-panel" hidden={hidden}>
      <p className="panel-label panel-label-icon" title="Fila de reação">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" /><path d="M8.2 8.1l4 2.1-4 2.1V8.1z" fill="currentColor" stroke="none" /><path d="M6 17h8" /></svg>
        <span className="sr-only">Fila de reação</span>
        <span className="panel-count">{sortedQueue.length}</span>
      </p>
      <div className="react-queue-list">
        {sortedQueue.length ? (
          sortedQueue.map((video) => <QueueRow video={video} isHistory={false} onContextMenu={onVideoContextMenu} key={video.id} />)
        ) : (
          <p className="empty-state">Nenhum vídeo esperando reação ainda.</p>
        )}
      </div>
      <div className="react-history-section" hidden={sortedHistory.length === 0}>
        <p className="react-history-label">já reagidos</p>
        <div className="react-history-list">
          {sortedHistory.map((video) => (
            <QueueRow video={video} isHistory key={video.id} />
          ))}
        </div>
      </div>
    </section>
  )
}
