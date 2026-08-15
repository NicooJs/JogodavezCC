import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

// mesma conexão que o app.js vanilla usa hoje: io({query:{leilaoId}}) sem
// URL (conecta na própria origem -- em dev isso é o servidor do Vite, que
// tem o proxy /socket.io configurado pro Express; em produção é o mesmo
// Express que serve o build). Um "update" reconstrói o snapshot inteiro
// (server já manda um completo em toda nova conexão), então reconexão
// automática do socket.io-client já resolve ressincronização sozinha, sem
// precisar de lógica de diff.
export function useLeaderboard(leilaoId) {
  const [leaderboard, setLeaderboard] = useState(null)
  const [lastEvent, setLastEvent] = useState(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!leilaoId) return undefined

    const socket = io({ query: { leilaoId } })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('update', (payload) => {
      setLeaderboard(payload.leaderboard)
      setLastEvent(payload.lastEvent || null)
    })

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [leilaoId])

  return { leaderboard, lastEvent, connected, socket: socketRef.current }
}
