import { useState } from 'react'
import { presenterFetch } from '../../lib/api.js'
import { formatBRL } from '../../lib/format.js'
import { mediaLabelCap } from '../../lib/media.js'
import { useDialogs } from '../../hooks/useDialogs.jsx'

function GameRow({ leilaoId, game }) {
  const { promptDialog, confirmDialog, renameGameDialog } = useDialogs()

  const adjust = (deltaAmount) =>
    presenterFetch(leilaoId, '/admin/adjust', { method: 'POST', body: JSON.stringify({ key: game.key, deltaAmount }) }).catch((err) => alert(err.message))

  const setTotal = async () => {
    const value = await promptDialog({
      title: 'Definir valor total',
      label: `Novo valor total para "${game.name}" (R$)`,
      initialValue: game.total.toFixed(2),
      inputType: 'number',
      confirmLabel: 'Salvar',
    })
    if (value === null) return
    presenterFetch(leilaoId, '/admin/set-total', { method: 'POST', body: JSON.stringify({ key: game.key, total: value }) }).catch((err) => alert(err.message))
  }

  const rename = async () => {
    const result = await renameGameDialog(game.name)
    if (!result) return
    try {
      await presenterFetch(leilaoId, '/admin/rename', { method: 'POST', body: JSON.stringify({ key: game.key, newName: result.name, image: result.image }) })
    } catch (err) {
      alert(err.message)
    }
  }

  const del = async () => {
    const ok = await confirmDialog({ title: 'Excluir jogo', message: `Excluir "${game.name}"?`, confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    presenterFetch(leilaoId, `/admin/game/${encodeURIComponent(game.key)}`, { method: 'DELETE' }).catch((err) => alert(err.message))
  }

  return (
    <tr>
      <td>{game.rank}</td>
      <td>{game.name}</td>
      <td>{formatBRL(game.total)}</td>
      <td className="row-actions">
        <button className="btn-mini" type="button" onClick={() => adjust(10)}>+10</button>
        <button className="btn-mini" type="button" onClick={() => adjust(-10)}>-10</button>
        <button className="btn-mini" type="button" onClick={setTotal}>definir valor</button>
        <button className="btn-mini" type="button" onClick={rename}>renomear</button>
        <button className="btn-mini danger" type="button" onClick={del}>excluir</button>
      </td>
    </tr>
  )
}

export default function GamesTab({ leilaoId, leaderboard }) {
  const games = leaderboard.items || []
  const mode = leaderboard.mode
  const [manualName, setManualName] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualAction, setManualAction] = useState('add')
  const [manualUsername, setManualUsername] = useState('')
  const [mergeFrom, setMergeFrom] = useState('')
  const [mergeTo, setMergeTo] = useState('')

  const submitManual = async () => {
    if (!manualName.trim() || !manualAmount) return alert('Preencha nome e valor')
    try {
      await presenterFetch(leilaoId, '/admin/manual-entry', {
        method: 'POST',
        body: JSON.stringify({ name: manualName.trim(), amount: manualAmount, action: manualAction, username: manualUsername.trim() }),
      })
      setManualName('')
      setManualAmount('')
      setManualUsername('')
    } catch (err) {
      alert(err.message)
    }
  }

  const submitMerge = async () => {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return alert('Escolha dois jogos diferentes')
    try {
      await presenterFetch(leilaoId, '/admin/merge', { method: 'POST', body: JSON.stringify({ fromKey: mergeFrom, toKey: mergeTo }) })
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="settings-panel-group">
      <div className="panel">
        <h2 className="panel-title">Lançamento manual</h2>
        <p className="hint">Use se receber um pix fora do app, ou pra testar o sistema.</p>
        <div className="panel-row wrap">
          <input type="text" placeholder={`Nome do ${mediaLabelCap(mode).toLowerCase()}`} autoComplete="off" value={manualName} onChange={(e) => setManualName(e.target.value)} />
          <input type="number" placeholder="Valor (R$)" step="0.01" autoComplete="off" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} />
          <select value={manualAction} onChange={(e) => setManualAction(e.target.value)}>
            <option value="add">Apoiar (+)</option>
            <option value="remove">Sabotar (-)</option>
          </select>
          <input type="text" placeholder="Nome do doador (opcional)" autoComplete="off" value={manualUsername} onChange={(e) => setManualUsername(e.target.value)} />
          <button className="btn-mini primary" type="button" onClick={submitManual}>Lançar</button>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">{mediaLabelCap(mode)}s na disputa</h2>
        <table className="table">
          <thead>
            <tr><th>#</th><th>{mediaLabelCap(mode)}</th><th>Total</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {games.map((game) => <GameRow leilaoId={leilaoId} game={game} key={game.key} />)}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 className="panel-title">Mesclar {mediaLabelCap(mode).toLowerCase()}s duplicados</h2>
        <p className="hint">Ex: alguém escreveu "elden ring" e outra vez "eldenring". Escolha a origem e o destino.</p>
        <div className="panel-row wrap">
          <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)}>
            <option value="">-- selecione --</option>
            {games.map((g) => <option value={g.key} key={g.key}>{g.name} ({formatBRL(g.total)})</option>)}
          </select>
          <span>→</span>
          <select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
            <option value="">-- selecione --</option>
            {games.map((g) => <option value={g.key} key={g.key}>{g.name} ({formatBRL(g.total)})</option>)}
          </select>
          <button className="btn-mini" type="button" onClick={submitMerge}>Mesclar</button>
        </div>
      </div>
    </div>
  )
}
