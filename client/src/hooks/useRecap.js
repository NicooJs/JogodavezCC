import { useCallback, useEffect, useRef, useState } from 'react'

// espelha showRecap/showHistoricalRecap/renderRecap do app.js vanilla --
// mostra o recap atual (auto, ao fechar o leilão) ou um round anterior
// (via ?recap=N na URL ou clique no histórico de Configurações).
export function useRecap(leilaoId) {
  const [view, setView] = useState(null)
  const openedFromUrl = useRef(false)

  // busca os dados do recap sem abrir o painel -- usado pelo WinnerReveal
  // pra ter o topGames (capa/nome/valor) disponível já no fechamento do
  // leilão, antes do momento de assentar o RecapModal de verdade.
  const prefetchCurrent = useCallback(async () => {
    try {
      return await fetch(`/api/l/${leilaoId}/recap`).then((r) => r.json())
    } catch (err) {
      console.error('Erro ao pré-buscar recap:', err.message)
      return null
    }
  }, [leilaoId])

  // abre o painel com um recap já buscado (ex: pelo prefetchCurrent acima),
  // sem repetir o fetch. `autoplay` diz se é a abertura ao vivo (o
  // WinnerReveal acabou de tocar, o painel entra em modo "assentando") ou
  // uma consulta parada (histórico, já monta no estado final).
  const openView = useCallback((recap, eyebrow, autoplay = false) => {
    setView({ recap, eyebrow, autoplay })
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
        setView({ recap, eyebrow: when ? `round encerrado em ${when}` : 'round anterior', autoplay: false })
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

  return { view, prefetchCurrent, openView, showHistorical, close }
}
