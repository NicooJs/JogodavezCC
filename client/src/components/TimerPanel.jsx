import { useTimer } from '../hooks/useTimer.js'

const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 28

export default function TimerPanel({ leaderboard, hidden }) {
  const timer = useTimer(leaderboard)
  const offset = TIMER_RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, timer.fraction)))
  const timerClass = `timer${timer.closed ? ' closed' : ''}${timer.paused ? ' paused' : ''}${timer.urgent ? ' urgent' : ''}`

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
    </section>
  )
}
