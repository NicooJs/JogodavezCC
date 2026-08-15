import { useEffect, useRef, useState } from 'react'
import { startSwirl } from '../lib/effects.js'

// "Vencedor!" -- swirl em canvas + texto, dispara quando `trigger` muda de
// identidade (App.jsx passa um objeto novo a cada leilão que fecha)
export default function SoldOverlay({ trigger }) {
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [label, setLabel] = useState('Vencedor!')
  const stopRef = useRef(null)
  const hideTimerRef = useRef(null)

  useEffect(() => {
    if (!trigger) return
    setLabel(trigger.leaderName ? `Vencedor: ${trigger.leaderName}!` : 'Vencedor!')
    setVisible(true)
    stopRef.current?.()
    clearTimeout(hideTimerRef.current)
    if (canvasRef.current) stopRef.current = startSwirl(canvasRef.current)
    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
      stopRef.current?.()
    }, 2300)
    return () => {
      clearTimeout(hideTimerRef.current)
      stopRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  return (
    <div className="sold-overlay" hidden={!visible} aria-hidden="true">
      <canvas className="sold-swirl-canvas" ref={canvasRef} />
      <span className="sold-mark">{label}</span>
    </div>
  )
}
