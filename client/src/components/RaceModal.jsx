import { useEffect, useRef, useState } from 'react'
import { presenterFetch } from '../lib/api.js'
import { formatBRL } from '../lib/format.js'
import { FlagIcon } from './icons.jsx'
import { useDialogs } from '../hooks/useDialogs.jsx'

export default function RaceModal({ leilaoId, item, onClose }) {
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { confirmDialog } = useDialogs()

  useEffect(() => {
    if (!item) return
    setValue(item.raceGoal ? item.raceGoal.toFixed(2) : '')
    const id = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 40)
    return () => clearTimeout(id)
  }, [item])

  if (!item) return null

  const goal = Number(value)
  const total = item.total || 0
  const hasGoal = !!goal && goal > 0
  const reached = hasGoal && total >= goal
  const pct = hasGoal ? Math.max(0, Math.min(100, Math.round((total / goal) * 100))) : 0

  const confirm = async () => {
    if (!value || Number(value) <= 0) {
      inputRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      await presenterFetch(leilaoId, '/admin/race-goal', { method: 'POST', body: JSON.stringify({ key: item.key, amount: value }) })
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const deactivate = async () => {
    const ok = await confirmDialog({
      title: 'Desativar modo corrida',
      message: `Remover a meta de "${item.name}"? A barra de progresso some do card.`,
      confirmLabel: 'Desativar',
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, `/admin/race-goal/${encodeURIComponent(item.key)}`, { method: 'DELETE' })
      onClose()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal race-modal-box" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="modal-head">
          {item.image ? <img className="modal-thumb" src={item.image} alt="" /> : null}
          <div className="modal-head-text">
            <p className="modal-eyebrow race-modal-eyebrow">
              <FlagIcon />
              modo corrida
            </p>
            <h2 className="modal-title">{item.name}</h2>
          </div>
        </div>

        <div className="race-modal-current">
          <span className="race-modal-current-label">arrecadado até aqui</span>
          <span className="race-modal-current-value">{formatBRL(total)}</span>
        </div>

        <div className="modal-field">
          <label className="modal-label">meta pra garantir vaga entre os classificados</label>
          <div className="amount-wrap modal-amount race-modal-amount">
            <span className="amount-prefix">R$</span>
            <input
              ref={inputRef}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
            />
          </div>
        </div>

        <div className={`lot-race race-modal-preview${reached ? ' is-reached' : ''}`}>
          <div className="lot-race-track"><div className="lot-race-fill" style={{ width: `${pct}%` }} /></div>
          <span className="lot-race-label">
            <FlagIcon />
            {!hasGoal
              ? 'defina um valor acima do já arrecadado'
              : reached
                ? 'já bateria a meta, classificado na hora'
                : `faltariam ${formatBRL(Math.max(0, goal - total))} pra classificar`}
          </span>
        </div>

        <div className="modal-actions">
          {item.raceGoal ? (
            <button className="btn-mini danger" type="button" onClick={deactivate}>Desativar corrida</button>
          ) : null}
          <button className="btn-mini" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-mini primary" type="button" disabled={submitting} onClick={confirm}>
            {item.raceGoal ? 'Salvar meta' : 'Ativar corrida'}
          </button>
        </div>
      </div>
    </div>
  )
}
