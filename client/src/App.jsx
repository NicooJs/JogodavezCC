import { useEffect, useRef, useState } from 'react'
import { useLeaderboard } from './hooks/useLeaderboard.js'
import { useDonationHistory } from './hooks/useDonationHistory.js'
import { usePresenterMode } from './hooks/usePresenterMode.js'
import { useRecap } from './hooks/useRecap.js'
import { DialogsProvider, useDialogs } from './hooks/useDialogs.jsx'
import { getLeilaoIdFromPath } from './lib/leilaoId.js'
import { presenterFetch } from './lib/api.js'
import Topbar from './components/Topbar.jsx'
import TotalRaisedChip from './components/TotalRaisedChip.jsx'
import SystemSwitch from './components/SystemSwitch.jsx'
import HostPanel from './components/HostPanel.jsx'
import DonorsPanel from './components/DonorsPanel.jsx'
import ArenaPanel from './components/ArenaPanel.jsx'
import TimerPanel from './components/TimerPanel.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import ReactsQueue from './components/ReactsQueue.jsx'
import BoardCoverBg from './components/BoardCoverBg.jsx'
import PresenterLoginModal from './components/PresenterLoginModal.jsx'
import ModCodeModal from './components/ModCodeModal.jsx'
import LotContextMenu from './components/LotContextMenu.jsx'
import RaceModal from './components/RaceModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import RecapModal from './components/RecapModal.jsx'
import SoldOverlay from './components/SoldOverlay.jsx'
import HistoryOverlay from './components/HistoryOverlay.jsx'
import RankingModal from './components/RankingModal.jsx'
import PresenterBar from './components/PresenterBar.jsx'
import LotModal from './components/LotModal.jsx'
import { formatBRL } from './lib/format.js'
import { mediaLabel } from './lib/media.js'
import { animateBoardBg } from './lib/effects.js'

const leilaoId = getLeilaoIdFromPath(window.location.pathname)

function BoardContent() {
  const { leaderboard, lastEvent, connected } = useLeaderboard(leilaoId)
  const historyItems = useDonationHistory(leilaoId, lastEvent)
  const presenter = usePresenterMode(leilaoId)
  const [loginOpen, setLoginOpen] = useState(false)
  const [modCode, setModCode] = useState(null)
  const [contextMenuTarget, setContextMenuTarget] = useState(null)
  const [raceModalItem, setRaceModalItem] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [soldTrigger, setSoldTrigger] = useState(null)
  const [rankingOpen, setRankingOpen] = useState(false)
  const [historyOverlayOpen, setHistoryOverlayOpen] = useState(false)
  const [lotModalGame, setLotModalGame] = useState(null)
  const recap = useRecap(leilaoId)
  const wasOpenRef = useRef(null)
  const boardBgRef = useRef(null)
  const { confirmDialog } = useDialogs()

  useEffect(() => {
    document.body.classList.toggle('presenter-mode', presenter.active)
  }, [presenter.active])

  useEffect(() => {
    if (!presenter.active) return
    if (new URLSearchParams(window.location.search).get('config') !== '1') return
    setSettingsOpen(true)
    const url = new URL(window.location.href)
    url.searchParams.delete('config')
    window.history.replaceState(null, '', url)
  }, [presenter.active])

  useEffect(() => {
    if (!boardBgRef.current) return
    let cancelled = false
    let cleanup = () => {}
    animateBoardBg(boardBgRef.current).then((stop) => {
      if (cancelled) stop()
      else cleanup = stop
    })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [!!leaderboard])

  useEffect(() => {
    if (!leaderboard) return
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = leaderboard.open
    if (wasOpen === true && leaderboard.open === false) {
      const leader = (leaderboard.items || [])[0]
      setSoldTrigger({ leaderName: leader ? leader.name : null, id: Date.now() })
      setTimeout(() => recap.showCurrent(), 2400)
    }
  }, [leaderboard?.open])

  useEffect(() => {
    document.documentElement.dataset.theme = leaderboard?.theme || 'cinza'
  }, [leaderboard?.theme])

  useEffect(() => {
    if (leaderboard?.backgroundImageUrl) {
      document.body.style.setProperty('--bg-image', `url("${leaderboard.backgroundImageUrl}")`)
      document.body.classList.add('has-bg-image')
    } else {
      document.body.classList.remove('has-bg-image')
      document.body.style.removeProperty('--bg-image')
    }
  }, [leaderboard?.backgroundImageUrl])

  const switchSystem = (system) => {
    presenterFetch(leilaoId, '/admin/active-system', {
      method: 'POST',
      body: JSON.stringify({ system }),
    }).catch((err) => alert(err.message))
  }

  const mergeLots = async (fromKey, toKey) => {
    const items = leaderboard?.items || []
    const fromItem = items.find((i) => i.key === fromKey)
    const toItem = items.find((i) => i.key === toKey)
    if (!fromItem || !toItem) return
    const ok = await confirmDialog({
      title: `Mesclar ${mediaLabel(leaderboard.mode)}s`,
      message: `Juntar "${fromItem.name}" (${formatBRL(fromItem.total)}) em "${toItem.name}"? O resultado fica com o nome "${toItem.name}" e total de ${formatBRL(fromItem.total + toItem.total)}. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Mesclar',
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, '/admin/merge', { method: 'POST', body: JSON.stringify({ fromKey, toKey }) })
    } catch (err) {
      alert(err.message)
    }
  }

  if (!leilaoId) {
    return <p style={{ padding: 24 }}>Leilão não encontrado (URL precisa ser /l/:id).</p>
  }
  if (!leaderboard) {
    return null
  }

  const isReacts = leaderboard.activeSystem === 'reacts'
  const donors = isReacts ? leaderboard.reactDonors : leaderboard.donors
  const profileHref = presenter.active && presenter.isOwner ? '/painel/perfil' : null

  return (
    <div className="page">
      <BoardCoverBg leilaoId={leilaoId} mode={leaderboard.mode} activeSystem={leaderboard.activeSystem} />
      <div className="board-bg" aria-hidden="true" ref={boardBgRef}>
        <span className="board-bg-shard board-bg-shard-1" />
        <span className="board-bg-shard board-bg-shard-2" />
        <span className="board-bg-shard board-bg-shard-3" />
        <span className="board-bg-shard board-bg-shard-4" />
        <span className="board-bg-shard board-bg-shard-5" />
      </div>

      <Topbar
        title={leaderboard.title}
        connected={connected}
        leilaoId={leilaoId}
        historyItems={historyItems}
        hostAvatar={leaderboard.hostAvatar}
        presenterActive={presenter.active}
        isOwner={presenter.isOwner}
        profileHref={profileHref}
        onRequestLogin={() => setLoginOpen(true)}
        onLogout={presenter.logout}
        onModCodeGenerated={setModCode}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRanking={() => setRankingOpen(true)}
      />

      {presenter.active ? (
        <PresenterBar
          leilaoId={leilaoId}
          leaderboard={leaderboard}
          items={leaderboard.items || []}
          onOpenLotModal={setLotModalGame}
          onOpenHistory={() => setHistoryOverlayOpen(true)}
        />
      ) : null}

      <main className="board">
        <SystemSwitch
          activeSystem={leaderboard.activeSystem}
          onSwitch={switchSystem}
          visible={presenter.active}
          profileHref={profileHref}
          hostAvatar={leaderboard.hostAvatar}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenRanking={() => setRankingOpen(true)}
          onOpenHistory={() => setHistoryOverlayOpen(true)}
        />

        <div className="col col-left">
          {isReacts ? null : (
            <TotalRaisedChip
              leilaoId={leilaoId}
              totalRaised={leaderboard.totalRaised}
              hideTotalRaised={leaderboard.hideTotalRaised}
              presenterActive={presenter.active}
            />
          )}
          <HostPanel leaderboard={leaderboard} />
          {isReacts ? null : <DonorsPanel donors={donors || []} totalRaised={leaderboard.totalRaised || 0} />}
        </div>

        <div className="col col-center">
          <ArenaPanel
            leilaoId={leilaoId}
            leaderboard={leaderboard}
            lastEvent={lastEvent}
            presenterActive={presenter.active}
            onLotContextMenu={
              presenter.active ? (x, y, item) => setContextMenuTarget({ type: 'race', x, y, item }) : undefined
            }
            onEditLot={presenter.active ? setLotModalGame : undefined}
            onMergeLots={presenter.active ? mergeLots : undefined}
          />
        </div>

        <div className="col col-right">
          <TimerPanel leilaoId={leilaoId} leaderboard={leaderboard} hidden={isReacts} presenterActive={presenter.active} />
          <HistoryPanel items={historyItems} hidden={isReacts} />
          <ReactsQueue
            leaderboard={leaderboard}
            hidden={!isReacts}
            onVideoContextMenu={
              presenter.active ? (x, y, video) => setContextMenuTarget({ type: 'react', x, y, video }) : undefined
            }
          />
        </div>
      </main>

      <footer className="footer">
        Capas de jogos via <a href="https://www.igdb.com" target="_blank" rel="noopener">IGDB</a>
        {' '}· <a href="/termos">termos de uso</a> · <a href="/privacidade">privacidade</a>
      </footer>

      <PresenterLoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={async (password) => {
          await presenter.login(password)
          setLoginOpen(false)
        }}
      />
      <ModCodeModal code={modCode} onClose={() => setModCode(null)} />
      <LotContextMenu
        leilaoId={leilaoId}
        target={contextMenuTarget}
        onClose={() => setContextMenuTarget(null)}
        onOpenRaceModal={setRaceModalItem}
      />
      <RaceModal leilaoId={leilaoId} item={raceModalItem} onClose={() => setRaceModalItem(null)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} leilaoId={leilaoId} leaderboard={leaderboard} />
      <SoldOverlay trigger={soldTrigger} />
      <RecapModal
        leilaoId={leilaoId}
        recap={recap.view?.recap}
        eyebrow={recap.view?.eyebrow}
        onClose={recap.close}
      />
      <HistoryOverlay
        leilaoId={leilaoId}
        open={historyOverlayOpen}
        onClose={() => setHistoryOverlayOpen(false)}
        onOpenRecap={recap.showHistorical}
      />
      <RankingModal leilaoId={leilaoId} open={rankingOpen} onClose={() => setRankingOpen(false)} />
      <LotModal
        leilaoId={leilaoId}
        game={lotModalGame}
        donorNames={leaderboard.donorNames || []}
        onClose={() => setLotModalGame(null)}
      />
    </div>
  )
}

export default function App() {
  return (
    <DialogsProvider leilaoId={leilaoId}>
      <BoardContent />
    </DialogsProvider>
  )
}
