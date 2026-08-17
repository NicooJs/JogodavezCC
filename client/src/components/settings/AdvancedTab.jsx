import { useEffect, useState } from 'react'
import { presenterFetch } from '../../lib/api.js'
import { formatBRL } from '../../lib/format.js'
import { useDialogs } from '../../hooks/useDialogs.jsx'

export default function AdvancedTab({ leilaoId }) {
  const [history, setHistory] = useState([])
  const [revokeFeedback, setRevokeFeedback] = useState(null)
  const { confirmDialog } = useDialogs()

  const loadHistory = () => {
    fetch(`/api/l/${leilaoId}/recap/history`)
      .then((res) => res.json())
      .then((data) => setHistory(data.history || []))
      .catch((err) => console.error('Erro ao carregar histórico:', err.message))
  }

  useEffect(() => {
    loadHistory()
  }, [leilaoId])

  const revokeMods = async () => {
    setRevokeFeedback(null)
    const ok = await confirmDialog({
      title: 'Revogar acesso de moderadores',
      message: 'Tem certeza?',
      confirmLabel: 'Revogar acesso',
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, '/admin/revoke-mod-sessions', { method: 'POST' })
      setRevokeFeedback('Acesso de moderadores revogado.')
    } catch (err) {
      setRevokeFeedback(`Erro: ${err.message}`)
    }
  }

  const resetAuction = async () => {
    const ok = await confirmDialog({ title: 'Zerar leilão', message: 'Isso apaga TODOS os jogos e o histórico. Tem certeza?', confirmLabel: 'Zerar leilão', danger: true })
    if (!ok) return
    await presenterFetch(leilaoId, '/admin/reset', { method: 'POST' })
    loadHistory()
  }

  return (
    <div className="settings-panel-group">
      <div className="panel">
        <h2 className="panel-title">Chave Pix e saldo</h2>
        <p className="hint">Chave Pix, saldo e saques agora ficam no <a href="/perfil">seu Perfil</a>, fora do escopo de um leilão específico.</p>
      </div>

      <div className="panel">
        <h2 className="panel-title">Histórico de leilões anteriores</h2>
        <p className="hint">Cada vez que você zera o leilão, um resumo do round fica guardado aqui.</p>
        {history.length === 0 ? (
          <p className="hint">Nenhum leilão zerado ainda.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Quando</th><th>Total</th><th>Lotes</th><th>Campeão</th><th></th></tr>
            </thead>
            <tbody>
              {history.map((h, index) => {
                const when = h.archivedAt ? new Date(h.archivedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
                const champion = h.topGames && h.topGames[0] ? h.topGames[0].name : '—'
                return (
                  <tr key={index}>
                    <td>{when}{h.openRound ? <span className="badge">em andamento</span> : null}</td>
                    <td>{h.totalRaised === null ? 'oculto' : formatBRL(h.totalRaised || 0)}</td>
                    <td>{h.totalGames || 0}</td>
                    <td>{champion}</td>
                    <td><a href={`/l/${leilaoId}?recap=${index}`} target="_blank" rel="noopener">Ver recap →</a></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2 className="panel-title">Moderadores</h2>
        <p className="hint">
          Derruba o acesso de qualquer moderador conectado agora com o
          código de uso único (eles precisam de um código novo pra
          entrar de novo). Não afeta você. Pra sair da sua própria conta,
          use o <a href="/perfil">seu Perfil</a>.
        </p>
        <div className="panel-row">
          <button className="btn-mini danger" type="button" onClick={revokeMods}>Revogar acesso de moderadores</button>
        </div>
        {revokeFeedback ? <p className="hint">{revokeFeedback}</p> : null}
      </div>

      <div className="panel danger-zone">
        <h2 className="panel-title">Zona de risco</h2>
        <button className="btn-mini danger" type="button" onClick={resetAuction}>Zerar leilão inteiro</button>
      </div>
    </div>
  )
}
