import { useState } from 'react'
import ExtratoModal from './ExtratoModal.jsx'
import { presenterFetch } from '../lib/api.js'

export default function TotalRaisedChip({ leilaoId, totalRaised, hideTotalRaised, presenterActive }) {
  const [extratoOpen, setExtratoOpen] = useState(false)

  const openExtrato = (e) => {
    if (e.target.closest('.total-hide-toggle')) return
    if (!presenterActive) return
    setExtratoOpen(true)
  }

  const toggleHideTotal = (e) => {
    e.stopPropagation()
    presenterFetch(leilaoId, '/admin/hide-total', {
      method: 'POST',
      body: JSON.stringify({ hidden: !hideTotalRaised }),
    }).catch((err) => alert(err.message))
  }

  return (
    <>
      <span
        className={`topbar-total${hideTotalRaised ? ' is-hidden' : ''}`}
        title="Ver extrato do leilão"
        role="button"
        tabIndex={0}
        onClick={openExtrato}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openExtrato(e))}
      >
        <svg className="icon topbar-total-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5v13" /><path d="M13.2 6.3c-.5-.9-1.6-1.4-3.2-1.4-2 0-3.4.9-3.4 2.4 0 3.1 6.8 1.3 6.8 4.4 0 1.5-1.4 2.4-3.4 2.4-1.6 0-2.7-.5-3.2-1.4" /></svg>
        <span className="topbar-total-label">total arrecadado</span>
        <strong className="topbar-total-value">
          R$&nbsp;<span>{Math.round(totalRaised || 0).toLocaleString('pt-BR')}</span>
        </strong>
        <strong className="topbar-total-hidden-label">oculto</strong>
        <button
          className={`total-hide-toggle${hideTotalRaised ? ' active' : ''}`}
          type="button"
          title={hideTotalRaised ? 'Mostrar valor arrecadado pro público' : 'Ocultar valor arrecadado do público'}
          onClick={toggleHideTotal}
        >
          <svg className="icon icon-eye" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" /><circle cx="10" cy="10" r="2.5" /></svg>
          <svg className="icon icon-eye-off" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 2.5l15 15" /><path d="M8.3 5.1C8.85 4.9 9.4 4.9 10 4.9c5.5 0 8.5 5.1 8.5 5.1s-1 1.7-2.7 3.3M5.2 6.2C3.2 7.6 1.5 10 1.5 10s3 5.1 8.5 5.1c1.1 0 2.1-.2 3-.6" /><path d="M7.9 8.1a2.5 2.5 0 0 0 3.5 3.5" /></svg>
        </button>
      </span>
      <ExtratoModal leilaoId={leilaoId} open={extratoOpen} onClose={() => setExtratoOpen(false)} />
    </>
  )
}
