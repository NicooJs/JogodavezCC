import { useState } from 'react'
import { useTimer } from '../hooks/useTimer.js'
import { presenterFetch } from '../lib/api.js'
import { useDialogs } from '../hooks/useDialogs.jsx'

const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 28

export default function TimerPanel({ leilaoId, leaderboard, hidden, presenterActive }) {
  const timer = useTimer(leaderboard)
  const [minutesInput, setMinutesInput] = useState('')
  const { confirmDialog } = useDialogs()
  const offset = TIMER_RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, timer.fraction)))
  const timerClass = `timer${timer.closed ? ' closed' : ''}${timer.paused ? ' paused' : ''}${timer.urgent ? ' urgent' : ''}`

  const isOpen = !!leaderboard?.open
  const isPaused = !!leaderboard?.paused
  const isLocked = !!leaderboard?.timerLocked

  const togglePause = async () => {
    try {
      await presenterFetch(leilaoId, '/admin/pause', {
        method: 'POST',
        body: JSON.stringify({ paused: !isPaused }),
      })
    } catch (err) {
      alert(err.message)
    }
  }

  const resetTimer = async () => {
    try {
      await presenterFetch(leilaoId, '/admin/reset-timer', { method: 'POST' })
    } catch (err) {
      alert(err.message)
    }
  }

  const toggleLock = async () => {
    try {
      await presenterFetch(leilaoId, '/admin/toggle-timer-lock', {
        method: 'POST',
        body: JSON.stringify({ locked: !isLocked }),
      })
    } catch (err) {
      alert(err.message)
    }
  }

  const setTimerMinutes = async () => {
    const minutes = Number(minutesInput)
    if (!minutes || minutes <= 0) return
    try {
      await presenterFetch(leilaoId, '/admin/set-timer', {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      })
      setMinutesInput('')
    } catch (err) {
      alert(err.message)
    }
  }

  const toggleOpen = async () => {
    if (isOpen) {
      const ok = await confirmDialog({
        title: 'Encerrar leilão',
        message: 'Encerrar o leilão agora? Ele só reabre quando você reabrir manualmente.',
        confirmLabel: 'Encerrar',
        danger: true,
      })
      if (!ok) return
    }
    try {
      await presenterFetch(leilaoId, '/admin/toggle-open', {
        method: 'POST',
        body: JSON.stringify({ open: !isOpen }),
      })
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <section className="panel timer-panel" id="timer-panel" hidden={hidden}>
      <p className="panel-label panel-label-icon" title="Timer">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="11" r="7" /><path d="M10 7.5V11l2.5 1.5" /><path d="M7.5 2.5h5" /></svg>
        <span className="sr-only">Timer</span>
      </p>
      <div className={timerClass} id="timer">
        <svg className="timer-ring" viewBox="0 0 64 64" width="52" height="52">
          <circle className="timer-ring-track" cx="32" cy="32" r="28" />
          <circle className="timer-ring-fill" style={{ strokeDashoffset: String(offset) }} cx="32" cy="32" r="28" />
        </svg>
        <div className="timer-text">
          <span className="timer-label">{timer.label}</span>
          <span className="timer-clock">{timer.clock}</span>
        </div>
      </div>

      {presenterActive ? (
        <>
          <div className="timer-toolbar timer-toolbar-state">
            <button
              className={`tbar-btn${isPaused ? ' is-paused' : ''}`}
              type="button"
              disabled={!isOpen}
              title={isOpen ? (isPaused ? 'Retomar timer' : 'Pausar timer') : 'Reabra o leilão pra poder pausar'}
              aria-label={isOpen ? (isPaused ? 'Retomar timer' : 'Pausar timer') : 'Reabra o leilão pra poder pausar'}
              onClick={togglePause}
            >
              <svg className="icon icon-pause" viewBox="0 0 20 20" fill="currentColor"><rect x="5.5" y="4" width="3.2" height="12" rx="1" /><rect x="11.3" y="4" width="3.2" height="12" rx="1" /></svg>
              <svg className="icon icon-play" viewBox="0 0 20 20" fill="currentColor"><path d="M6 4.2c0-.9 1-1.5 1.8-1l8 5.8c.7.5.7 1.5 0 2l-8 5.8c-.8.5-1.8-.1-1.8-1V4.2z" /></svg>
              <span className="sr-only">{isPaused ? 'Retomar' : 'Pausar'}</span>
            </button>
            <span className="tbar-divider" aria-hidden="true"></span>
            <button
              className={`tbar-btn tbar-btn-danger${!isOpen ? ' is-closed' : ''}`}
              type="button"
              title={isOpen ? 'Encerrar leilão' : 'Reabrir leilão'}
              aria-label={isOpen ? 'Encerrar leilão' : 'Reabrir leilão'}
              onClick={toggleOpen}
            >
              <svg className="icon icon-stop" viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
              <svg className="icon icon-reopen" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 9.5a5.5 5.5 0 1 1 1.4 3.6" /><path d="M4.5 13.2v-3.7h3.7" /></svg>
              <span className="sr-only">{isOpen ? 'Encerrar' : 'Reabrir'}</span>
            </button>
          </div>

          <div className="timer-toolbar timer-toolbar-duration">
            <button className="tbar-btn" type="button" title="Reiniciar timer" aria-label="Reiniciar timer" onClick={resetTimer}>
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="11" r="6.5" /><path d="M9 8v3l2.2 1.3" /><path d="M14.5 2.5v3.2h-3.2" /><path d="M14.5 5.5A6.5 6.5 0 0 0 9 4.5" /></svg>
            </button>
            <span className="tbar-divider" aria-hidden="true"></span>
            <div className="tbar-custom">
              <input
                type="number"
                className="tbar-input"
                placeholder="min"
                min="1"
                max="180"
                inputMode="numeric"
                value={minutesInput}
                onChange={(e) => setMinutesInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setTimerMinutes() }}
              />
              <button className="tbar-icon-btn" type="button" title="Definir duração" aria-label="Definir duração" onClick={setTimerMinutes}>
                <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
              </button>
            </div>
          </div>

          <div className="timer-toolbar timer-toolbar-lock">
            <button
              className={`tbar-btn tbar-btn-wide${isLocked ? ' is-locked' : ''}`}
              type="button"
              title={isLocked ? 'Destravar -- doações voltam a somar tempo' : 'Impede que novas doações somem mais tempo -- pra dar o ultimato'}
              aria-pressed={String(isLocked)}
              onClick={toggleLock}
            >
              <svg className="icon icon-lock-open" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="11" height="7" rx="1.5" /><path d="M6.5 9V6.3a3.5 3.5 0 0 1 6.6-1.6" /></svg>
              <svg className="icon icon-lock-closed" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="11" height="7" rx="1.5" /><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" /></svg>
              <span>{isLocked ? 'Tempo travado' : 'Travar tempo'}</span>
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
