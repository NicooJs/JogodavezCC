import { useEffect, useRef, useState } from 'react'
import { presenterFetch } from '../lib/api.js'
import { FlagIcon, StopIcon, ReactModeIcon, TrashIcon } from './icons.jsx'
import { useDialogs } from '../hooks/useDialogs.jsx'

// menu de botão direito: modo corrida (nos cards do catálogo do leilão) ou
// "marcar como reagido" (na fila do reacts) -- mesmo elemento/CSS pros
// dois, só o conteúdo muda (espelha openLotContextMenu/openReactContextMenu
// do app.js vanilla).
export default function LotContextMenu({ leilaoId, target, onClose, onOpenRaceModal }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const { confirmDialog } = useDialogs()

  useEffect(() => {
    if (!target) {
      setPos(null)
      return
    }
    const rect = menuRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8))
    const top = Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8))
    setPos({ left, top })
  }, [target])

  useEffect(() => {
    if (!target) return undefined
    function onDocClick(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return
      onClose()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    function onScroll() {
      onClose()
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onClose)
    }
  }, [target, onClose])

  if (!target) return null

  const deactivateRace = async () => {
    const item = target.item
    onClose()
    const ok = await confirmDialog({
      title: 'Desativar modo corrida',
      message: `Remover a meta de "${item.name}"? A barra de progresso some do card.`,
      confirmLabel: 'Desativar',
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, `/admin/race-goal/${encodeURIComponent(item.key)}`, { method: 'DELETE' })
    } catch (err) {
      alert(err.message)
    }
  }

  const deleteLot = async () => {
    const item = target.item
    onClose()
    const ok = await confirmDialog({
      title: 'Excluir jogo',
      message: `Excluir "${item.name}" do catálogo? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, `/admin/game/${encodeURIComponent(item.key)}`, { method: 'DELETE' })
    } catch (err) {
      alert(err.message)
    }
  }

  const markReacted = async () => {
    const videoId = target.video.id
    onClose()
    try {
      await presenterFetch(leilaoId, `/admin/reacts/${videoId}/mark-reacted`, { method: 'POST' })
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div
      className="lot-context-menu"
      ref={menuRef}
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      {target.type === 'race' ? (
        <>
          <div className="lot-context-menu-head">
            <span className="lot-context-menu-eyebrow"><FlagIcon />modo corrida</span>
            <span className="lot-context-menu-game">{target.item.name}</span>
          </div>
          {target.item.raceGoal ? (
            <>
              <button className="lot-context-menu-item" type="button" onClick={() => { onOpenRaceModal(target.item); onClose() }}>
                <FlagIcon />Editar meta da corrida
              </button>
              <button className="lot-context-menu-item danger" type="button" onClick={deactivateRace}>
                <StopIcon />Desativar modo corrida
              </button>
            </>
          ) : (
            <button className="lot-context-menu-item" type="button" onClick={() => { onOpenRaceModal(target.item); onClose() }}>
              <FlagIcon />Ativar modo corrida
            </button>
          )}
          <button className="lot-context-menu-item danger" type="button" onClick={deleteLot}>
            <TrashIcon />Excluir jogo
          </button>
        </>
      ) : (
        <>
          <div className="lot-context-menu-head">
            <span className="lot-context-menu-eyebrow"><ReactModeIcon />modo reacts</span>
            <span className="lot-context-menu-game">{target.video.title || ''}</span>
          </div>
          <button className="lot-context-menu-item" type="button" onClick={markReacted}>
            <ReactModeIcon />Marcar como reagido
          </button>
        </>
      )}
    </div>
  )
}
