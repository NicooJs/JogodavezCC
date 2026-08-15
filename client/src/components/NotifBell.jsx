import { useEffect, useRef, useState } from 'react'
import { presenterFetch } from '../lib/api.js'
import { formatBRL, initial } from '../lib/format.js'
import { useDialogs } from '../hooks/useDialogs.jsx'

function centsToNumberLocal(cents) {
  return Math.round(Number(cents) || 0) / 100
}

function historyText(item) {
  if (item.type === 'add' || item.type === 'manual') return `${item.username || 'Anônimo'} apoiou ${item.game ? item.game.name : ''}`
  if (item.type === 'remove') return `${item.username || 'Anônimo'} tirou pontos de ${item.game ? item.game.name : ''}`
  if (item.type === 'pending') return `${item.username || 'Anônimo'} doou, aguardando identificação`
  if (item.type === 'ignored') return `${item.username || 'Anônimo'} doou sem indicar um lote`
  if (item.type === 'closed') return `${item.username || 'Anônimo'} doou (leilão encerrado, não contabilizado)`
  return null
}

function NotifAvatar({ username, avatar }) {
  return avatar ? (
    <img className="notif-item-avatar" src={avatar} alt="" loading="lazy" />
  ) : (
    <span className="notif-item-avatar">{initial(username)}</span>
  )
}

export default function NotifBell({ leilaoId, active, historyItems }) {
  const [open, setOpen] = useState(false)
  const [pendingDonations, setPendingDonations] = useState([])
  const [pendingReactVideos, setPendingReactVideos] = useState([])
  const wrapRef = useRef(null)
  const { confirmDialog, renameGameDialog, promptDialog } = useDialogs()

  const loadPending = async () => {
    try {
      const { pending } = await presenterFetch(leilaoId, '/admin/pending')
      setPendingDonations(pending || [])
    } catch (err) {
      console.error('Erro ao carregar doações pendentes:', err)
    }
    try {
      const { pending } = await presenterFetch(leilaoId, '/admin/reacts/pending')
      setPendingReactVideos(pending || [])
    } catch (err) {
      console.error('Erro ao carregar vídeos pendentes do modo reacts:', err)
    }
  }

  useEffect(() => {
    if (!active) {
      setOpen(false)
      setPendingDonations([])
      setPendingReactVideos([])
    }
  }, [active])

  useEffect(() => {
    function onDocClick(e) {
      if (!open) return
      if (wrapRef.current && wrapRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  if (!active) return null

  const toggleOpen = () => {
    const opening = !open
    setOpen(opening)
    if (opening) loadPending()
  }

  const dismiss = async (ev) => {
    const ok = await confirmDialog({
      title: 'Marcar como apoio geral',
      message: `Marcar a doação de ${ev.username || 'anônimo'} como apoio geral? Ela continua contando no total arrecadado, só não vai pro catálogo.`,
      confirmLabel: 'Marcar',
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, `/admin/pending/${ev.id}/dismiss`, { method: 'POST' })
      setPendingDonations((prev) => prev.filter((p) => p.id !== ev.id))
    } catch (err) {
      alert(err.message)
    }
  }

  const identify = async (ev) => {
    const result = await renameGameDialog(ev.raw_message || '', { title: 'Identificar doação', confirmLabel: 'Atribuir' })
    if (!result) return
    try {
      await presenterFetch(leilaoId, `/admin/pending/${ev.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ gameName: result.name, gameImage: result.image }),
      })
      setPendingDonations((prev) => prev.filter((p) => p.id !== ev.id))
    } catch (err) {
      alert(err.message)
    }
  }

  const reject = async (video) => {
    const ok = await confirmDialog({
      title: 'Rejeitar vídeo sugerido',
      message: `Rejeitar "${video.title}"? A doação continua contando no total arrecadado, só o vídeo não entra na disputa.`,
      confirmLabel: 'Rejeitar',
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, `/admin/reacts/${video.id}/reject`, { method: 'POST' })
      setPendingReactVideos((prev) => prev.filter((v) => v.id !== video.id))
    } catch (err) {
      alert(err.message)
    }
  }

  const approve = async (video) => {
    const nickname = await promptDialog({
      title: 'Aprovar vídeo',
      label: `Apelido curto pra "${video.title}" -- é o que a doação por texto vai reconhecer depois pra somar nesse vídeo`,
      initialValue: (video.title || '').slice(0, 24),
      confirmLabel: 'Aprovar',
    })
    if (!nickname || !nickname.trim()) return

    let durationSeconds = video.durationSeconds
    if (!durationSeconds) {
      const minutesStr = await promptDialog({
        title: 'Duração do vídeo',
        label: 'Duração em minutos -- não deu pra detectar automaticamente',
        inputType: 'number',
        confirmLabel: 'Continuar',
      })
      if (!minutesStr) return
      const minutes = Number(minutesStr)
      if (!Number.isFinite(minutes) || minutes <= 0) return alert('Duração inválida')
      durationSeconds = Math.round(minutes * 60)
    }

    try {
      await presenterFetch(leilaoId, `/admin/reacts/${video.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ nickname: nickname.trim(), durationSeconds }),
      })
      setPendingReactVideos((prev) => prev.filter((v) => v.id !== video.id))
    } catch (err) {
      alert(err.message)
    }
  }

  const pendingIds = new Set(pendingDonations.map((p) => p.id))
  const feed = historyItems.filter((item) => !(item.eventId && pendingIds.has(item.eventId))).slice(0, 30)
  const badgeCount = pendingDonations.length + pendingReactVideos.length
  const hasAnything = badgeCount > 0 || feed.some((item) => historyText(item))

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        className={`notif-bell-trigger${open ? ' active' : ''}`}
        type="button"
        aria-haspopup="true"
        aria-expanded={String(open)}
        aria-label="Notificações"
        title="Notificações"
        onClick={toggleOpen}
      >
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 2.5c-2.5 0-4 1.9-4 4.5v2.3c0 .6-.2 1.2-.6 1.7l-.9 1.1c-.6.8 0 2 1 2h9c1 0 1.6-1.2 1-2l-.9-1.1c-.4-.5-.6-1.1-.6-1.7V7c0-2.6-1.5-4.5-4-4.5z" /><path d="M8.2 16.5a1.8 1.8 0 0 0 3.6 0" /></svg>
        {badgeCount > 0 ? <span className="notif-bell-badge">{badgeCount > 99 ? '99+' : badgeCount}</span> : null}
      </button>
      {open ? (
        <div className="notif-bell-dropdown">
          <div className="notif-bell-head"><span>Notificações</span></div>

          {pendingReactVideos.length > 0 ? <p className="notif-bell-section-label">vídeos sugeridos</p> : null}
          <div className="notif-bell-pending">
            {pendingReactVideos.map((video) => {
              const time = video.createdAt ? new Date(video.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
              const amount = video.pendingAmountCents ? formatBRL(centsToNumberLocal(video.pendingAmountCents)) : ''
              return (
                <div className="notif-item is-pending" key={video.id}>
                  <NotifAvatar username={video.title} avatar={video.thumbnail} />
                  <div className="notif-item-body">
                    <div className="notif-item-meta">
                      <span className="notif-item-who">{video.submittedBy || 'Anônimo'}</span>
                      {amount ? <span className="notif-item-amt">{amount}</span> : null}
                      <span className="notif-item-time">{time}</span>
                    </div>
                    <p className="notif-item-msg">{video.title || video.url || ''}</p>
                    <div className="notif-item-actions">
                      <button className="btn-mini primary" type="button" onClick={() => approve(video)}>aprovar</button>
                      <button className="btn-mini" type="button" onClick={() => reject(video)}>rejeitar</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="notif-bell-pending">
            {pendingDonations.map((ev) => {
              const time = ev.created_at ? new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
              const msg = (ev.raw_message || '').trim()
              return (
                <div className="notif-item is-pending" key={ev.id}>
                  <NotifAvatar username={ev.username} avatar={ev.avatar} />
                  <div className="notif-item-body">
                    <div className="notif-item-meta">
                      <span className="notif-item-who">{ev.username || 'Anônimo'}</span>
                      <span className="notif-item-amt">{formatBRL(centsToNumberLocal(ev.amount_cents))}</span>
                      <span className="notif-item-time">{time}</span>
                    </div>
                    <p className={`notif-item-msg${msg ? '' : ' is-empty'}`}>{msg || 'sem mensagem'}</p>
                    <div className="notif-item-actions">
                      <button className="btn-mini primary" type="button" onClick={() => identify(ev)}>identificar</button>
                      <button className="btn-mini" type="button" onClick={() => dismiss(ev)}>apoio geral</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="notif-bell-list">
            {feed.map((item, index) => {
              const text = historyText(item)
              if (!text) return null
              const time = item.time ? new Date(item.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
              const msg = (item.message || '').trim()
              return (
                <div className="notif-item" key={item.eventId || `${item.time}-${index}`}>
                  <NotifAvatar username={item.username} avatar={item.avatar} />
                  <div className="notif-item-body">
                    <div className="notif-item-meta">
                      <span className="notif-item-who">{text}</span>
                      <span className="notif-item-time">{time}</span>
                    </div>
                    {msg ? <p className="notif-item-msg">{msg}</p> : null}
                  </div>
                </div>
              )
            })}
          </div>

          {!hasAnything ? <p className="notif-bell-empty">Nenhuma mensagem ainda.</p> : null}
        </div>
      ) : null}
    </div>
  )
}
