import { useEffect, useRef, useState } from 'react'
import { presenterFetch } from '../lib/api.js'

// meta global de corrida: um valor só pro leilão inteiro + quantas vagas
// bônus ela concede -- funciona junto com a meta manual por lote (botão
// direito no card continua existindo pra customizar um caso específico,
// sempre tem prioridade sobre essa aqui pro mesmo lote). Modal simples de
// propósito, só os dois campos -- quem quiser afinar por lote usa o menu
// de contexto do card, não aqui.
export default function RaceConfigModal({ leilaoId, open, raceGoal, raceMaxWinners, mediaLabel, onClose }) {
  const amountRef = useRef(null)
  const [amount, setAmount] = useState('')
  const [maxWinners, setMaxWinners] = useState('3')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount(raceGoal ? raceGoal.toFixed(2) : '')
    setMaxWinners(raceMaxWinners ? String(raceMaxWinners) : '3')
    const id = setTimeout(() => amountRef.current?.focus(), 40)
    return () => clearTimeout(id)
  }, [open, raceGoal, raceMaxWinners])

  if (!open) return null

  const save = async () => {
    if (!amount || Number(amount) <= 0) {
      amountRef.current?.focus()
      return
    }
    const winners = Number(maxWinners)
    if (!Number.isFinite(winners) || winners < 1) return
    setSubmitting(true)
    try {
      await presenterFetch(leilaoId, '/admin/race-config', {
        method: 'POST',
        body: JSON.stringify({ amount, maxWinners: winners }),
      })
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const deactivate = async () => {
    setSubmitting(true)
    try {
      await presenterFetch(leilaoId, '/admin/race-config', { method: 'DELETE' })
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="modal-head">
          <div className="modal-head-text">
            <p className="modal-eyebrow race-modal-eyebrow">
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2.5v15" /><path d="M4 3.5c2-1 3.5 1 5.5 0s3.5-1 5.5 0v6c-2-1-3.5 1-5.5 0s-3.5-1-5.5 0z" /></svg>
              modo corrida
            </p>
            <h2 className="modal-title">Meta geral do leilão</h2>
          </div>
        </div>

        <p className="modal-hint">
          Qualquer {mediaLabel} que chegar nesse valor primeiro garante a própria posição, mesmo que outros passem ele em dinheiro depois. Vale pra quem não tiver uma meta própria definida (botão direito no card continua funcionando pra customizar um lote específico).
        </p>

        <div className="modal-field">
          <label className="modal-label">valor pra garantir a vaga</label>
          <div className="amount-wrap modal-amount race-modal-amount">
            <span className="amount-prefix">R$</span>
            <input
              ref={amountRef}
              type="number"
              placeholder="0,00"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">quantas vagas bônus</label>
          <input
            type="number"
            className="modal-input"
            min="1"
            max="20"
            step="1"
            value={maxWinners}
            onChange={(e) => setMaxWinners(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>

        <div className="modal-actions">
          {raceGoal ? (
            <button className="btn-mini danger" type="button" disabled={submitting} onClick={deactivate}>Desativar</button>
          ) : null}
          <button className="btn-mini" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-mini primary" type="button" disabled={submitting} onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
