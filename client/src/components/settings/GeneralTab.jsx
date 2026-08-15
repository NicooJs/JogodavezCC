import { useEffect, useState } from 'react'
import { presenterFetch } from '../../lib/api.js'
import CopyButton from '../CopyButton.jsx'
import { useDialogs } from '../../hooks/useDialogs.jsx'

export default function GeneralTab({ leilaoId, leaderboard }) {
  const [title, setTitle] = useState(leaderboard.title || '')
  const [qualifyCount, setQualifyCount] = useState(leaderboard.qualifyCount || 3)
  const [reactMultiplier, setReactMultiplier] = useState(leaderboard.reactMultiplier || '')
  const [alertTestDone, setAlertTestDone] = useState(false)
  const { confirmDialog } = useDialogs()

  useEffect(() => {
    setTitle(leaderboard.title || '')
  }, [leaderboard.title])
  useEffect(() => {
    setQualifyCount(leaderboard.qualifyCount || 3)
  }, [leaderboard.qualifyCount])
  useEffect(() => {
    setReactMultiplier(leaderboard.reactMultiplier || '')
  }, [leaderboard.reactMultiplier])

  const donateLink = `${window.location.origin}/l/${leilaoId}/doar`
  const alertLink = `${window.location.origin}/l/${leilaoId}/alerta`

  const saveTitle = () => presenterFetch(leilaoId, '/admin/title', { method: 'POST', body: JSON.stringify({ title: title.trim() }) })

  const toggleOpen = async () => {
    const isOpen = leaderboard.open
    if (isOpen) {
      const ok = await confirmDialog({
        title: 'Encerrar leilão',
        message: 'Encerrar o leilão agora? Ele só reabre quando você reabrir manualmente.',
        confirmLabel: 'Encerrar',
        danger: true,
      })
      if (!ok) return
    }
    await presenterFetch(leilaoId, '/admin/toggle-open', { method: 'POST', body: JSON.stringify({ open: !isOpen }) })
  }

  const testAlert = async () => {
    try {
      await presenterFetch(leilaoId, '/admin/test-alert', { method: 'POST' })
      setAlertTestDone(true)
      setTimeout(() => setAlertTestDone(false), 1500)
    } catch (err) {
      alert(err.message)
    }
  }

  const saveQualify = () => presenterFetch(leilaoId, '/admin/qualify-count', { method: 'POST', body: JSON.stringify({ count: qualifyCount }) }).catch((err) => alert(err.message))

  const saveMultiplier = () => {
    const amount = Number(reactMultiplier)
    if (!Number.isFinite(amount) || amount <= 0) return alert('Informe um valor por minuto válido')
    presenterFetch(leilaoId, '/admin/reacts/multiplier', { method: 'POST', body: JSON.stringify({ amount }) }).catch((err) => alert(err.message))
  }

  const qualifyPct = ((qualifyCount - 1) / 9) * 100

  return (
    <div className="settings-panel-group">
      <div className="panel">
        <div className="panel-row">
          <div>
            <label>Título exibido no placar</label>
            <input type="text" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <button className="tbar-icon-btn" type="button" title="Salvar título" aria-label="Salvar título" onClick={saveTitle}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
          </button>
        </div>
        <div className="panel-row">
          <div>
            <label>Link de doação (fixe no chat da live)</label>
            <input type="text" readOnly value={donateLink} />
          </div>
          <CopyButton value={donateLink} />
        </div>
        <div className="panel-row">
          <div>
            <label>Link de alerta pro OBS (Browser Source)</label>
            <input type="text" readOnly value={alertLink} />
          </div>
          <div className="panel-row-btns">
            <button className={`settings-icon-btn${alertTestDone ? ' is-done' : ''}`} type="button" title="Testar alerta" aria-label="Testar alerta" onClick={testAlert}>
              <span className="settings-icon-btn-icon settings-icon-btn-icon-play" aria-hidden="true"><svg className="icon" viewBox="0 0 20 20" fill="currentColor" stroke="none"><path d="M6 4.5v11l9-5.5-9-5.5z" /></svg></span>
              <span className="settings-icon-btn-icon settings-icon-btn-icon-check" aria-hidden="true"><svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg></span>
            </button>
            <CopyButton value={alertLink} />
          </div>
        </div>
        <div className="panel-row">
          <div>
            <label>Leilão está</label>
            <span className={`badge${leaderboard.open ? '' : ' closed'}`}>{leaderboard.open ? 'aberto' : 'encerrado'}</span>
          </div>
          <button className="btn-mini" type="button" onClick={toggleOpen}>{leaderboard.open ? 'Encerrar leilão' : 'Reabrir leilão'}</button>
        </div>
        <div className="panel-row">
          <div className="qualify-slider-field">
            <label>
              Quantos lotes contam como classificados <span className="qualify-slider-value">{qualifyCount}</span>
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
          <button className="btn-mini" type="button" onClick={saveQualify}>Salvar</button>
        </div>
        <div className="panel-row">
          <div>
            <label>Modo reacts: valor por minuto de vídeo (R$)</label>
            <input
              type="number"
              placeholder="Valor por minuto (R$)"
              step="0.01"
              autoComplete="off"
              value={reactMultiplier}
              onChange={(e) => setReactMultiplier(e.target.value)}
            />
          </div>
          <button className="btn-mini" type="button" onClick={saveMultiplier}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
