import { useEffect, useRef, useState } from 'react'

// espelha historyItems/loadInitialHistory/pushHistory do app.js vanilla --
// carrega os últimos eventos via REST na conexão, depois empilha cada
// lastEvent novo que chegar por socket (useLeaderboard já expõe isso).
export function useDonationHistory(leilaoId, lastEvent) {
  const [items, setItems] = useState([])
  const itemsRef = useRef(items)
  const lastSeenEvent = useRef(null)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    if (!leilaoId) return
    let cancelled = false
    fetch(`/api/l/${leilaoId}/events/recent?limit=30`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const mapped = data.events
          .filter((e) => e.action === 'add' || e.action === 'remove' || e.action === 'ignored')
          .map((e) => ({
            type: e.pending ? 'pending' : e.dismissed ? 'ignored' : e.action,
            username: e.username,
            amount: e.amount,
            avatar: e.avatar,
            message: e.raw_message,
            eventId: e.id,
            pending: !!e.pending,
            game: e.game_name ? { name: e.game_name } : null,
            time: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
          }))
        setItems(mapped)
      })
      .catch((err) => console.error('Erro ao carregar histórico:', err))
    return () => {
      cancelled = true
    }
  }, [leilaoId])

  useEffect(() => {
    if (!lastEvent || lastEvent === lastSeenEvent.current) return
    lastSeenEvent.current = lastEvent
    const isHistoryType = ['add', 'remove', 'manual', 'pending', 'ignored', 'closed'].includes(lastEvent.type)
    if (!isHistoryType) return
    const next = [{ ...lastEvent, time: Date.now() }, ...itemsRef.current].slice(0, 50)
    itemsRef.current = next
    setItems(next)
  }, [lastEvent])

  return items
}
