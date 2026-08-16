import { useState } from 'react'
import { useLeaderboard } from './hooks/useLeaderboard.js'
import { DialogsProvider } from './hooks/useDialogs.jsx'
import { SettingsPanelContent } from './components/SettingsModal.jsx'

// montado pelo hub (/painel) dentro do próprio side-drawer, sem carregar o
// board -- só essa árvore de componentes conecta ao socket do leilão e
// chama presenterFetch, igual o SettingsModal de dentro do board faz.
export default function SettingsStandalone({ leilaoId }) {
  const { leaderboard } = useLeaderboard(leilaoId)
  const [tab, setTab] = useState('geral')

  if (!leaderboard) return <p className="hub-modal-loading">Carregando…</p>

  return (
    <DialogsProvider leilaoId={leilaoId}>
      <SettingsPanelContent leilaoId={leilaoId} leaderboard={leaderboard} tab={tab} setTab={setTab} />
    </DialogsProvider>
  )
}
