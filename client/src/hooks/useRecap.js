import { useCallback, useEffect, useRef, useState } from 'react'

// espelha showRecap/showHistoricalRecap/renderRecap do app.js vanilla --
// mostra o recap atual (auto, ao fechar o leilão) ou um round anterior
// (via ?recap=N na URL ou clique no histórico de Configurações).
export function useRecap(leilaoId) {
  const [view, setView] = useState(null)
  const openedFromUrl = useRef(false)

  const showCurrent = useCallback(async () => {
    try {
      const recap = await fetch(`/api/l/${leilaoId}/recap`).then((r) => r.json())
      setView({ recap, eyebrow: 'leilão encerrado' })
    } catch (err) {
      console.error('Erro ao buscar recap:', err.message)
    }
  }, [leilaoId])

  // igual showCurrent, mas só devolve os dados -- não abre o modal. Usado
  // pelo WinnerReveal pra ter o topGames (capa/nome/valor) disponível já no
  // fechamento do leilão, antes do momento de abrir o RecapModal de verdade.
  const prefetchCurrent = useCallback(async () => {
    try {
      return await fetch(`/api/l/${leilaoId}/recap`).then((r) => r.json())
    } catch (err) {
      console.error('Erro ao pré-buscar recap:', err.message)
      return null
    }
  }, [leilaoId])

  // abre o modal com um recap já buscado (ex: pelo prefetchCurrent acima),
  // sem repetir o fetch.
  const openView = useCallback((recap, eyebrow) => {
    setView({ recap, eyebrow })
  }, [])

  const showHistorical = useCallback(
    async (index) => {
      try {
        const data = await fetch(`/api/l/${leilaoId}/recap/history`).then((r) => r.json())
        const recap = (data.history || [])[index]
        if (!recap) return
        const when = recap.archivedAt
          ? new Date(recap.archivedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
          : ''
        setView({ recap, eyebrow: when ? `round encerrado em ${when}` : 'round anterior' })
      } catch (err) {
        console.error('Erro ao buscar recap histórico:', err.message)
      }
    },
    [leilaoId],
  )

  const close = useCallback(() => setView(null), [])

  useEffect(() => {
    if (openedFromUrl.current || !leilaoId) return
    openedFromUrl.current = true
    const recapParam = new URLSearchParams(window.location.search).get('recap')
    if (recapParam !== null && /^\d+$/.test(recapParam)) {
      showHistorical(Number(recapParam))
    }
  }, [leilaoId, showHistorical])

  return { view, showCurrent, prefetchCurrent, openView, showHistorical, close }
}
