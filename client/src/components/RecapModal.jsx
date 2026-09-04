import { Fragment, useEffect, useState } from 'react'
import { formatBRL, initial } from '../lib/format.js'
import { RankBadge, FlagIcon } from './icons.jsx'
import { buildRecapCanvas, downloadCanvasAsPng } from '../lib/effects.js'
import { mediaLabel as getMediaLabel } from '../lib/media.js'
import RecapLotCard from './RecapLotCard.jsx'

const RECORD_BOLT_ICON_SVG = (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M11 2.5 4.5 11.5h4.2L8 17.5l7.5-9.5h-4.5L11 2.5z" fill="currentColor" />
  </svg>
)

const TROPHY_ICON_SVG = (
  <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 4h8v3a4 4 0 0 1-8 0V4z" fill="currentColor" />
    <path d="M6 4.8H4.5a1.3 1.3 0 0 0-1.3 1.3c0 1.4 1.1 2.5 2.5 2.5H6M14 4.8h1.5a1.3 1.3 0 0 1 1.3 1.3c0 1.4-1.1 2.5-2.5 2.5H14" fill="currentColor" />
    <rect x="9.2" y="10.7" width="1.6" height="3.1" fill="currentColor" />
    <path d="M7 15.3h6l-.6-1.9H7.6l-.6 1.9z" fill="currentColor" />
  </svg>
)

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—'
  const totalMin = Math.round(ms / 60000)
  if (totalMin === 0) return '<1min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  return `${h}h${String(m).padStart(2, '0')}`
}

// bandeirinha que marca um jogo que garantiu a vaga pela trava do modo
// corrida (não por ser naturalmente um dos mais arrecadadores) -- só
// aparece se o round teve corrida ativa (recap.raceActive)
function RaceBadge() {
  return (
    <span className="recap-race-badge" title="Vaga garantida pelo modo corrida">
      <FlagIcon />
    </span>
  )
}

// pódio "assentado" do recap -- reaproveita a mesma linguagem visual do
// card do WinnerReveal (capa + medalha + nome + valor, glow no rank 1),
// só que em layout flex normal em vez do overlay fullscreen em
// perspectiva 3D (ver .recap-hero-podium em style.css)
function HeroPodiumCard({ game, raceActive }) {
  return (
    <div className={`winner-reveal-card recap-hero-card rank-${game.rank}`}>
      {game.image ? (
        <img className="winner-reveal-thumb" src={game.image} alt="" />
      ) : (
        <div className="winner-reveal-thumb winner-reveal-thumb-placeholder">{initial(game.name)}</div>
      )}
      <div className="winner-reveal-info">
        <span className="winner-reveal-rank">
          <RankBadge rank={game.rank} />
          {raceActive && game.qualifiedByRace ? <RaceBadge /> : null}
        </span>
        <p className="winner-reveal-name">{game.name}</p>
        <p className="winner-reveal-total">{formatBRL(game.total)}</p>
        <p className="recap-hero-donors">{game.donorCount} {game.donorCount === 1 ? 'apoiador' : 'apoiadores'}</p>
        {game.topDonor ? <p className="recap-hero-top-donor">apoiador: {game.topDonor.username}</p> : null}
      </div>
    </div>
  )
}

export default function RecapModal({ leilaoId, recap, eyebrow, revealing, onClose }) {
  // `revealing` só é true na abertura ao vivo, logo depois do WinnerReveal
  // -- o painel monta "compacto" (sem as seções de baixo) e expande pro
  // tamanho final ~60ms depois (dá tempo do navegador pintar o estado
  // inicial antes de animar). Histórico nunca passa por isso, já monta
  // assentado.
  const [settled, setSettled] = useState(!revealing)

  useEffect(() => {
    if (!recap) return
    if (!revealing) {
      setSettled(true)
      return
    }
    setSettled(false)
    const id = setTimeout(() => setSettled(true), 60)
    return () => clearTimeout(id)
  }, [recap, revealing])

  if (!recap) return null

  const shareText = recap.totalRaised === null
    ? 'Acabei de fazer um leilão de jogos com a galera! Dá uma olhada:'
    : `Acabei de arrecadar ${formatBRL(recap.totalRaised || 0)} num leilão de jogos com a galera! Dá uma olhada:`

  const allGames = recap.topGames || []
  // o quadrado principal (pódio + "também classificados") só considera
  // quem tá classificado de verdade -- allGames pode ter até 10 pra
  // alimentar o painel do catálogo ao lado, mas o quadrado em si não muda
  // de tamanho/conteúdo por causa disso.
  const winningGames = allGames.filter((g) => g.winning)
  const top3 = winningGames.slice(0, 3)
  const extraGames = winningGames.slice(3)
  const topDonors = recap.topDonors || []
  const champion = top3[0]
  const label = getMediaLabel(recap.mode)

  // divisor "classificados até aqui" no painel do catálogo (lado direito),
  // depois do ÚLTIMO item ainda classificado (winning) -- mesma lógica de
  // qualifyBoundaryKey em ArenaPanel.jsx, portada pro recap
  let qualifyBoundaryKey = null
  for (let i = allGames.length - 1; i >= 0; i--) {
    if (allGames[i].winning) {
      qualifyBoundaryKey = i < allGames.length - 1 ? allGames[i].key : null
      break
    }
  }

  const download = async () => {
    const canvas = await buildRecapCanvas(recap, leilaoId)
    if (canvas) downloadCanvasAsPng(canvas, leilaoId)
  }

  const shareX = async (e) => {
    e.preventDefault()
    const canvas = await buildRecapCanvas(recap, leilaoId)
    if (!canvas) return
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return

    const file = new File([blob], `recap-${leilaoId}.png`, { type: 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: shareText })
        return
      } catch (err) {
        if (err && err.name === 'AbortError') return
      }
    }

    const twitterWindow = window.open('', '_blank')
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      }
    } catch {
      // sem suporte a clipboard de imagem -- segue só com o texto no intent
    }
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
    if (twitterWindow) twitterWindow.location.href = intentUrl
    else window.open(intentUrl, '_blank')
  }

  const modalClass = ['recap-modal', revealing ? 'recap-modal-revealing' : '', settled ? 'is-settled' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="recap-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={modalClass} role="dialog" aria-modal="true">
        <button className="recap-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="recap-share-corner">
          <a className="recap-share-icon-btn" href="#" title="Compartilhar no X" aria-label="Compartilhar no X" onClick={shareX}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.6L4.5 22H1.4l8.1-9.3L1 2h7.1l4.9 6.1L18.9 2z" /></svg>
          </a>
          <button className="recap-share-icon-btn" type="button" title="Baixar recap" aria-label="Baixar recap como imagem" onClick={download}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          </button>
        </div>

        {recap.hostAvatar ? <img className="recap-host-avatar" src={recap.hostAvatar} alt="" /> : null}
        <p className="recap-eyebrow">{eyebrow}</p>
        <h2 className="recap-title">{recap.title || 'JogodaVez'}</h2>

        <p className="recap-section-label">TOP 3</p>
        <div className="recap-hero-podium">
          {top3.map((game) => <HeroPodiumCard game={game} raceActive={!!recap.raceActive} key={game.key} />)}
        </div>

        <div className="recap-below-hero">
          <div className="recap-stats">
            <div className="recap-stat">
              <span className="recap-stat-value">{recap.totalRaised === null ? 'oculto' : formatBRL(recap.totalRaised || 0)}</span>
              <span className="recap-stat-label">arrecadado</span>
            </div>
            <div className="recap-stat">
              <span className="recap-stat-value">{formatDuration(recap.durationMs)}</span>
              <span className="recap-stat-label">duração</span>
            </div>
            <div className="recap-stat">
              <span className="recap-stat-value">{recap.totalDonors || 0}</span>
              <span className="recap-stat-label">apoiadores</span>
            </div>
            <div className="recap-stat">
              <span className="recap-stat-value">{recap.totalGames || 0}</span>
              <span className="recap-stat-label">lotes disputados</span>
            </div>
          </div>

          {champion || recap.biggestDonation ? (
            <div className="recap-highlight">
              {champion ? (
                <p className="recap-highlight-line">
                  <span className="recap-highlight-icon">{TROPHY_ICON_SVG}</span>
                  <strong>{champion.name}</strong> foi o campeão, arrecadando {formatBRL(champion.total)}
                </p>
              ) : null}
              {recap.biggestDonation ? (
                <p className="recap-highlight-line">
                  <span className="recap-highlight-icon recap-highlight-icon-bolt">{RECORD_BOLT_ICON_SVG}</span>
                  recorde de doação: <strong>{recap.biggestDonation.username || 'Anônimo'}</strong> mandou {formatBRL(recap.biggestDonation.amount)} em {recap.biggestDonation.gameName || ''}
                </p>
              ) : null}
            </div>
          ) : null}

          {extraGames.length > 0 ? (
            <div className="recap-extra">
              <p className="recap-section-label">também classificados</p>
              <div className="recap-extra-list">
                {extraGames.map((game) => (
                  <div className="recap-extra-row" key={game.key}>
                    <span className="recap-extra-rank">{String(game.rank).padStart(2, '0')}</span>
                    {game.image ? (
                      <img className="recap-extra-thumb" src={game.image} alt="" loading="lazy" />
                    ) : (
                      <span className="recap-extra-thumb recap-extra-thumb-placeholder">{initial(game.name)}</span>
                    )}
                    <span className="recap-extra-name">
                      {game.name}
                      {recap.raceActive && game.qualifiedByRace ? <RaceBadge /> : null}
                    </span>
                    <span className="recap-extra-total">{formatBRL(game.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {topDonors.length > 0 ? (
            <>
              <p className="recap-section-label">maiores apoiadores</p>
              <div className="recap-donor-list">
                {topDonors.map((d) => (
                  <div className={`recap-donor-row rank-${d.rank}`} key={d.username + d.rank}>
                    <span className="recap-donor-rank"><RankBadge rank={d.rank} /></span>
                    {d.avatar ? (
                      <img className="recap-donor-avatar" src={d.avatar} alt="" loading="lazy" />
                    ) : (
                      <span className="recap-donor-avatar recap-donor-avatar-placeholder">{initial(d.username)}</span>
                    )}
                    <span className="recap-donor-name">{d.username || 'Anônimo'}</span>
                    <span className="recap-donor-total">{formatBRL(d.total)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {allGames.length > 0 ? (
        <div className="recap-catalog-panel" onClick={(e) => e.stopPropagation()}>
          <p className="recap-section-label">catálogo</p>
          <div className="recap-lot-list">
            {allGames.map((game) => (
              <Fragment key={game.key}>
                <RecapLotCard item={game} mediaLabel={label} />
                {game.key === qualifyBoundaryKey ? (
                  <div className="qualify-divider">
                    <span>classificados até aqui</span>
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
