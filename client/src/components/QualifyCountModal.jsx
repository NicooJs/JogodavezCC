import { useEffect, useState } from 'react'
import { presenterFetch } from '../lib/api.js'

// acesso rápido pro total de vagas classificadas (qualifyCount) direto do
// mini-menu do apresentador -- antes só dava pra mudar isso lá no fundo de
// Configurações → Geral, pedido explícito do cliente pra facilitar durante
// a live. Mesmo slider/endpoint que GeneralTab.jsx já usa
// (POST /admin/qualify-count), não duplica lógica nova nenhuma.
export default function QualifyCountModal({ leilaoId, open, qualifyCount: currentCount, mediaLabel, onClose }) {
  const [qualifyCount, setQualifyCount] = useState(currentCount || 3)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setQualifyCount(currentCount || 3)
  }, [open, currentCount])

  if (!open) return null

  const qualifyPct = ((qualifyCount - 1) / 9) * 100

  const save = async () => {
    setSubmitting(true)
    try {
      await presenterFetch(leilaoId, '/admin/qualify-count', { method: 'POST', body: JSON.stringify({ count: qualifyCount }) })
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
            <p className="modal-eyebrow">total de vagas</p>
            <h2 className="modal-title">Quantos {mediaLabel}s classificam</h2>
          </div>
        </div>

        <p className="modal-hint">
          Quantos {mediaLabel}s contam como classificados por dinheiro. O modo
          corrida (lápis → Modo corrida) pode abrir vagas extras além desse
          número, pra quem bater a meta primeiro.
        </p>

        <div className="modal-field">
          <div className="qualify-slider-field">
            <label>
              Vagas classificadas <span className="qualify-slider-value">{qualifyCount}</span>
            </label>
            <div className="qualify-slider-track-wrap">
              <input
                type="range"
                className="qualify-slider"
                min="1"
                max="10"
                step="1"
                value={qualifyCount}
                style={{ '--qualify-pct': `${qualifyPct}%` }}
                onChange={(e) => setQualifyCount(Number(e.target.value))}
              />
              <div className="qualify-slider-ticks" aria-hidden="true">
                {Array.from({ length: 10 }).map((_, i) => <span key={i} />)}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-mini" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-mini primary" type="button" disabled={submitting} onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
