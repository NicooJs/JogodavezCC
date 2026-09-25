import { useEffect, useRef, useState } from 'react'

const FINAL_COUNTDOWN_SECONDS = 90

function clockText(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// mesma lógica de tickTimer() do app.js vanilla, só que devolve um objeto
// de estado em vez de escrever direto no DOM -- recalcula a cada segundo
// porque o servidor não avisa a cada tick, só timerEndsAt/timerRemainingMs.
// timerEndsAt aqui é SEMPRE o valor recalculado no relógio do cliente (ver
// useTimer abaixo), nunca leaderboard.timerEndsAt (timestamp absoluto do
// servidor) direto -- comparar relógio de duas máquinas diferentes vaza
// qualquer dessincronia de horário entre elas.
function computeTimerState(leaderboard, timerEndsAt) {
  if (!leaderboard) {
    return { label: 'encerra em', clock: '--:--', fraction: 0, urgent: false, closed: false, paused: false }
  }
  const { open, paused, timerRemainingMs, timerDurationMs } = leaderboard

  if (!open) {
    return { label: 'leilão', clock: 'TERMINADO', fraction: 0, urgent: false, closed: true, paused: false }
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
    return { label: 'leilão', clock: 'TERMINADO', fraction: 0, urgent: false, closed: true, paused: false }
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
  // deadline recalculado no relógio do próprio cliente toda vez que o
  // servidor manda leaderboard novo (Date.now() local + timerRemainingMs,
  // que já vem certo do servidor) -- nunca usa leaderboard.timerEndsAt
  // direto, mesmo bug já corrigido antes em doar.js/app.js, só que o
  // useTimer.js do board React nunca tinha recebido o fix (bug real
  // reportado: streamer definia 5min mas a contagem saía errada quando o
  // relógio do PC de quem via estava dessincronizado).
  const timerEndsAtRef = useRef(null)
  const [state, setState] = useState(() => computeTimerState(leaderboard, null))

  useEffect(() => {
    timerEndsAtRef.current =
      leaderboard && leaderboard.timerRemainingMs != null ? Date.now() + leaderboard.timerRemainingMs : null
    setState(computeTimerState(leaderboard, timerEndsAtRef.current))
    const id = setInterval(() => setState(computeTimerState(leaderboard, timerEndsAtRef.current)), 1000)
    return () => clearInterval(id)
  }, [leaderboard])

  return state
}
