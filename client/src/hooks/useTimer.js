import { useEffect, useState } from 'react'

const FINAL_COUNTDOWN_SECONDS = 90

function clockText(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// mesma lógica de tickTimer() do app.js vanilla, só que devolve um objeto
// de estado em vez de escrever direto no DOM -- recalcula a cada segundo
// porque o servidor não avisa a cada tick, só timerEndsAt/timerRemainingMs.
function computeTimerState(leaderboard) {
  if (!leaderboard) {
    return { label: 'encerra em', clock: '--:--', fraction: 0, urgent: false, closed: false, paused: false }
  }
  const { open, paused, timerEndsAt, timerRemainingMs, timerDurationMs } = leaderboard

  if (!open) {
    return { label: 'leilão', clock: 'ENCERRADO', fraction: 0, urgent: false, closed: true, paused: false }
  }

  if (paused) {
    const totalSeconds = Math.ceil((timerRemainingMs || 0) / 1000)
    return {
      label: 'pausado em',
      clock: clockText(totalSeconds),
      fraction: (timerRemainingMs || 0) / timerDurationMs,
      urgent: false,
      closed: false,
      paused: true,
    }
  }

  if (!timerEndsAt) {
    return { label: 'encerra em', clock: '--:--', fraction: 0, urgent: false, closed: false, paused: false }
  }

  const msLeft = timerEndsAt - Date.now()
  if (msLeft <= 0) {
    return { label: 'leilão', clock: 'ENCERRADO', fraction: 0, urgent: false, closed: true, paused: false }
  }
  const totalSeconds = Math.ceil(msLeft / 1000)
  return {
    label: 'encerra em',
    clock: clockText(totalSeconds),
    fraction: msLeft / timerDurationMs,
    urgent: totalSeconds <= FINAL_COUNTDOWN_SECONDS,
    closed: false,
    paused: false,
  }
}

export function useTimer(leaderboard) {
  const [state, setState] = useState(() => computeTimerState(leaderboard))

  useEffect(() => {
    setState(computeTimerState(leaderboard))
    const id = setInterval(() => setState(computeTimerState(leaderboard)), 1000)
    return () => clearInterval(id)
  }, [leaderboard])

  return state
}
