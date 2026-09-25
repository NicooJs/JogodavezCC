import NotifBell from './NotifBell.jsx'
import TopbarMenu from './TopbarMenu.jsx'

export default function Topbar({
  title,
  connected,
  leilaoId,
  historyItems,
  hostAvatar,
  presenterActive,
  isOwner,
  profileHref,
  onRequestLogin,
  onLogout,
  onModCodeGenerated,
  onOpenSettings,
  onOpenRanking,
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-mascot" aria-hidden="true">
          <span className="topbar-mascot-glow" />
          <img className="topbar-mascot-img" src="/img/loading-mascot.png" alt="" />
        </div>
        <p className="topbar-mark">
          <span className="brand-word">{title}</span>
        </p>
      </div>
      <div className="topbar-right">
        <NotifBell leilaoId={leilaoId} active={presenterActive} historyItems={historyItems} />
        <TopbarMenu
          leilaoId={leilaoId}
          connected={connected}
          hostAvatar={hostAvatar}
          presenterActive={presenterActive}
          isOwner={isOwner}
          profileHref={profileHref}
          onRequestLogin={onRequestLogin}
          onLogout={onLogout}
          onModCodeGenerated={onModCodeGenerated}
          onOpenSettings={onOpenSettings}
          onOpenRanking={onOpenRanking}
        />
      </div>
    </header>
  )
}
