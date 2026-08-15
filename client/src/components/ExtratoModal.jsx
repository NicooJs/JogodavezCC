import { useEffect, useState } from 'react'
import { presenterFetch } from '../lib/api.js'
import { formatBRL } from '../lib/format.js'

export default function ExtratoModal({ leilaoId, open, onClose }) {
  const [state, setState] = useState({ loading: true, rows: [], totalRaised: 0, error: null })

  useEffect(() => {
    if (!open) return
    setState({ loading: true, rows: [], totalRaised: 0, error: null })
    presenterFetch(leilaoId, '/extrato')
      .then(({ rows, totalRaised }) => setState({ loading: false, rows, totalRaised, error: null }))
      .catch((err) => setState({ loading: false, rows: [], totalRaised: 0, error: err.message }))
  }, [open, leilaoId])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal extrato-modal-box" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="modal-head">
          <div className="modal-head-text">
            <p className="modal-eyebrow">extrato do leilão</p>
            <h2 className="modal-title">Movimentações</h2>
          </div>
        </div>
        <div className="extrato-summary">
          {state.loading ? (
            <span className="extrato-summary-label">carregando…</span>
          ) : state.error ? null : (
            <>
              <span className="extrato-summary-label">total arrecadado</span>
              <span className="extrato-summary-value">{formatBRL(state.totalRaised)}</span>
              <span className="extrato-summary-count">{state.rows.length} doaç{state.rows.length === 1 ? 'ão' : 'ões'}</span>
            </>
          )}
        </div>
        {!state.loading && (state.error || state.rows.length === 0) ? (
          <p className="extrato-empty">{state.error ? `Erro ao carregar o extrato: ${state.error}` : 'Nenhuma doação registrada ainda.'}</p>
        ) : (
          <div className="extrato-table-wrap">
            <table className="extrato-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Doador</th>
                  <th>Jogo</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row, index) => {
                  const time = row.time
                    ? new Date(row.time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : ''
                  const isNegative = row.action === 'remove'
                  const gameLabel = row.pending ? 'aguardando identificação' : row.dismissed ? 'apoio geral' : (row.game || '—')
                  return (
                    <tr key={index}>
                      <td className="extrato-time">{time}</td>
                      <td className="extrato-who">{row.username || 'Anônimo'}</td>
                      <td className={`extrato-game${row.pending || row.dismissed ? ' is-pending' : ''}`}>{gameLabel}</td>
                      <td className={`extrato-amt ${isNegative ? 'is-negative' : 'is-positive'}`}>{isNegative ? '−' : '+'}{formatBRL(row.amount)}</td>
                      <td className="extrato-balance">{formatBRL(row.balance)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
