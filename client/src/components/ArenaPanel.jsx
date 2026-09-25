import { Fragment, useEffect, useRef, useState } from 'react'
import LotCard from './LotCard.jsx'
import ReactsPlayer from './ReactsPlayer.jsx'
import { mediaLabel } from '../lib/media.js'
import { triggerConfettiBurst } from '../lib/effects.js'

function streakTier(count) {
  if (count >= 7) return 3
  if (count >= 4) return 2
  return 1
}

export default function ArenaPanel({ leilaoId, leaderboard, lastEvent, presenterActive, onLotContextMenu, onCatalogContextMenu, onEditLot, onMergeLots }) {
  const isReacts = leaderboard.activeSystem === 'reacts'
  const items = leaderboard.items || []
  const qualifyCount = leaderboard.qualifyCount || 3

  const previousTotals = useRef(new Map())
  const [changedKeys, setChangedKeys] = useState(new Set())
  const [flash, setFlash] = useState(null)
  const flashTimer = useRef(null)
  const [firingKey, setFiringKey] = useState(null)
  const firingTimer = useRef(null)
  const cardNodes = useRef(new Map())

  useEffect(() => {
    const next = new Map()
    const changed = new Set()
    items.forEach((item) => {
      next.set(item.key, item.total)
      if (previousTotals.current.has(item.key) && previousTotals.current.get(item.key) !== item.total) {
        changed.add(item.key)
      }
    })
    previousTotals.current = next
    setChangedKeys(changed)
  }, [items])

  useEffect(() => {
    if (!lastEvent || (lastEvent.type !== 'add' && lastEvent.type !== 'remove') || !lastEvent.game) return
    clearTimeout(flashTimer.current)
    setFlash({ key: lastEvent.game.key, type: lastEvent.type })
    flashTimer.current = setTimeout(() => setFlash(null), 4000)

    if ((lastEvent.amount || 0) > 100) {
      const node = cardNodes.current.get(lastEvent.game.key)
      if (node) {
        const isAdd = lastEvent.type === 'add'
        triggerConfettiBurst(node.getBoundingClientRect(), {
          colors: isAdd
            ? ['var(--accent)', 'var(--accent-text)', 'var(--positive)', 'var(--silver)']
            : ['var(--danger)', '#ff8fa8', 'var(--muted)'],
          count: isAdd ? 40 : 26,
          spark: !isAdd,
          spreadY: 30,
        })
      }
    }
    return () => clearTimeout(flashTimer.current)
  }, [lastEvent])

  // !hype "jogo" a cada 5 likes (ver twitchChatBot.js, era a cada 10 --
  // intensificado a pedido do cliente) -- só o gatilho pontual, o contador
  // em si (item.likes) já vem sempre no leaderboard, igual combo/streak.
  // 6000ms bate com a duração de lot-card-firing em style.css.
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'hype' || !lastEvent.fire || !lastEvent.game) return
    clearTimeout(firingTimer.current)
    setFiringKey(lastEvent.game.key)
    firingTimer.current = setTimeout(() => setFiringKey(null), 6000)
    return () => clearTimeout(firingTimer.current)
  }, [lastEvent])

  let duelDefender = null
  let duelChallenger = null
  if (items.length > qualifyCount) {
    // baseado na posição NATURAL por dinheiro, não em item.rank -- rank já
    // incorpora travas de corrida, que podem congelar um lote numa posição
    // bem diferente do que ele vale de verdade em dinheiro (bug real visto
    // em produção: o lote com o MAIOR valor do catálogo aparecia como
    // "defendendo" uma vaga que não corria risco nenhum, só porque tinha
    // sido travado ali antes de virar o líder). "natural" não vem pronto
    // da API, mas dá pra derivar: qualifiedByRace só é true quando o lote
    // é bônus (não natural) e sempre implica winning=true -- então
    // "natural" é ganhar sem ser via bônus. NENHUM dos dois lados do duelo
    // pode ser um lote já travado (raceLocked) -- travado não corre risco
    // (não pode perder a vaga) nem ameaça ninguém (já tem a própria vaga
    // garantida, não precisa "roubar" a de mais ninguém). Bug real visto
    // em produção: um lote travado só por bônus (fora do top natural, mas
    // com a própria trava permanente) aparecia como "desafiante" de quem
    // já era vencedor natural, mesmo sem correr risco nenhum de perder
    // essa trava -- o duelo ficava sem sentido nenhum pros dois lados.
    const naturalWinnerKeys = new Set(items.filter((i) => i.winning && !i.qualifiedByRace).map((i) => i.key))
    const defenderCandidate = items
      .filter((i) => naturalWinnerKeys.has(i.key) && !i.raceLocked)
      .reduce((weakest, i) => (!weakest || i.total < weakest.total ? i : weakest), null)
    const challengerCandidate = items
      .filter((i) => !naturalWinnerKeys.has(i.key) && !i.raceLocked)
      .reduce((strongest, i) => (!strongest || i.total > strongest.total ? i : strongest), null)
    if (defenderCandidate && challengerCandidate && defenderCandidate.total > 0) {
      const ratio = challengerCandidate.total / defenderCandidate.total
      if (ratio >= 0.65) {
        duelDefender = defenderCandidate
        duelChallenger = challengerCandidate
      }
    }
  }

  // linha "classificados até aqui" fica depois do ÚLTIMO item ainda
  // classificado (winning), não numa posição fixa de rank -- rank sozinho
  // não reflete mais o corte de verdade depois que a corrida pode
  // classificar um lote fora do topo natural (esse lote entra winning mas
  // pode ficar em qualquer posição, inclusive depois do corte natural de
  // qualifyCount). Bug real visto em produção: com a linha fixa em
  // rank===qualifyCount, um lote classificado pela corrida numa posição
  // maior aparecia visualmente "fora" da própria linha de classificados.
  let qualifyBoundaryKey = null
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].winning) {
      qualifyBoundaryKey = i < items.length - 1 ? items[i].key : null
      break
    }
  }

  if (isReacts) {
    return <ReactsPlayer leilaoId={leilaoId} leaderboard={leaderboard} presenterActive={presenterActive} />
  }

  const maxTotal = Math.max(...items.map((i) => i.total), 1)
  const label = `Catálogo do ${mediaLabel(leaderboard.mode)}`

  return (
    <section className="panel arena-panel">
      <p className="panel-label panel-label-icon" title={label}>
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="6" height="6" rx="1" /><rect x="11.5" y="4" width="6" height="6" rx="1" /><rect x="2.5" y="12" width="6" height="4" rx="1" /><rect x="11.5" y="12" width="6" height="4" rx="1" /></svg>
        <span className="sr-only">{label}</span>
        <span className="panel-count">{items.length}</span>
      </p>
      <div
        className="arena-grid"
        onContextMenu={
          onCatalogContextMenu
            ? (e) => {
                // deixa o botão direito do próprio card cuidar do menu dele
                // (modo corrida/excluir) -- aqui só o clique fora de qualquer
                // card, no catálogo vazio, abre "adicionar manualmente"
                if (e.target.closest('.lot-card')) return
                e.preventDefault()
                onCatalogContextMenu(e.clientX, e.clientY)
              }
            : undefined
        }
      >
        {items.length === 0 ? (
          <p className="empty-state arena-empty">
            <span className="arena-empty-title">Catálogo vazio</span>
            O primeiro lance abre a disputa.
          </p>
        ) : (
          items.map((item, index) => {
            const barPct = item.total > 0 ? Math.max(3, Math.round((item.total / maxTotal) * 100)) : 0
            const combo = item.combo
            const streakActive = !!combo && combo.count >= 2 && combo.expiresAt > Date.now()
            const isFlashingSabotage = flash && flash.key === item.key && flash.type === 'remove'
            const hitBadge = isFlashingSabotage ? (
              <span className="badge-hit">sabotado agora</span>
            ) : item.key === leaderboard.lastSabotagedKey ? (
              <span className="badge-hit badge-hit-last">último sabotado</span>
            ) : null
            const duelRole =
              duelDefender && item.key === duelDefender.key
                ? 'defender'
                : duelChallenger && item.key === duelChallenger.key
                  ? 'challenger'
                  : null
            const isQualifyBoundary = item.key === qualifyBoundaryKey
            return (
              <Fragment key={item.key}>
                <LotCard
                  item={item}
                  barPct={barPct}
                  changed={changedKeys.has(item.key)}
                  hitBadge={hitBadge}
                  streakTier={streakActive ? streakTier(combo.count) : 0}
                  firing={firingKey === item.key}
                  duelRole={duelRole}
                  duelChallengerDeficit={duelChallenger && item.key === duelChallenger.key ? duelDefender.total - item.total : 0}
                  mediaLabel={mediaLabel(leaderboard.mode)}
                  onContextMenu={onLotContextMenu}
                  onEdit={onEditLot}
                  onDrop={onMergeLots}
                  cardRef={(node) => {
                    if (node) cardNodes.current.set(item.key, node)
                    else cardNodes.current.delete(item.key)
                  }}
                />
                {isQualifyBoundary ? (
                  <div className={`qualify-divider${duelDefender && duelChallenger ? ' is-duel' : ''}`}>
                    <span>{duelDefender && duelChallenger ? 'disputa pela última vaga' : 'classificados até aqui'}</span>
                  </div>
                ) : null}
              </Fragment>
            )
          })
        )}
      </div>
    </section>
  )
}
