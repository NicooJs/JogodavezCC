import { useEffect, useRef, useState } from 'react'
import { formatBRL, initial } from '../lib/format.js'
import { RankBadge } from './icons.jsx'
import { triggerConfettiBurst } from '../lib/effects.js'

const CORRIDOR_MS = 1400
const PODIUM_MS = 1100
const CELEBRATE_MS = 1800
const EXIT_MS = 300
const SKIP_APPEARS_AFTER_MS = 1000
const CONFETTI_COLORS = ['#d1b3fa', '#ffd166', '#6ee7b7', '#ff8a5c']
// espelha .winner-reveal-card.rank-1 / .winner-reveal-podium .rank-1 em
// style.css -- usado só pra mirar o confete, ver comentário mais abaixo
const RANK1_WIDTH = 228
const RANK1_SCALE = 1.18
const RANK1_LIFT_PX = 48

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// posição no leque: rank 1 sempre no centro (slot 0), os demais alternando
// esquerda/direita conforme se afastam do centro (2→-1, 3→+1, 4→-2, 5→+2...)
// -- é o que dá o efeito de "convergência pro vencedor" do corredor 3D.
function fanSlot(rank) {
  if (rank <= 1) return 0
  const half = Math.ceil((rank - 1) / 2)
  return rank % 2 === 0 ? -half : half
}

// corredor 3D (inspirado no "Image Stream Hero" do 21st.dev, só como
// referência visual -- nenhum código de lá foi copiado) que resolve num
// pódio triangular com os jogos/filmes de verdade que disputaram o round.
// Substitui o antigo swirl genérico de SoldOverlay.jsx.
export default function WinnerReveal({ trigger, onDone }) {
  const [visible, setVisible] = useState(false)
  const [phase, setPhase] = useState('corridor')
  const [showSkip, setShowSkip] = useState(false)
  const timersRef = useRef([])
  const doneRef = useRef(onDone)
  const confettiFiredRef = useRef(false)
  const doneSignaledRef = useRef(false)

  doneRef.current = onDone

  // sinaliza o pai (App.jsx) que já pode assentar o recap por baixo --
  // idempotente porque tanto o fim natural da sequência quanto "pular"/Esc
  // podem chamar isso.
  const signalDone = () => {
    if (doneSignaledRef.current) return
    doneSignaledRef.current = true
    doneRef.current?.()
  }

  const finish = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    signalDone()
    setVisible(false)
  }

  useEffect(() => {
    if (!trigger || !trigger.recap || !(trigger.recap.topGames || []).length) return
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    confettiFiredRef.current = false
    doneSignaledRef.current = false
    setShowSkip(false)
    setVisible(true)

    const reduced = prefersReducedMotion()
    if (reduced) {
      setPhase('podium')
      timersRef.current.push(setTimeout(finish, 900))
      return () => timersRef.current.forEach(clearTimeout)
    }

    setPhase('corridor')
    timersRef.current.push(
      setTimeout(() => setShowSkip(true), SKIP_APPEARS_AFTER_MS),
      setTimeout(() => setPhase('podium'), CORRIDOR_MS),
      // sinaliza o pai já ao ENTRAR na saída (não só depois dela terminar)
      // -- o recap monta e começa a aparecer por baixo enquanto esse
      // overlay ainda tá no meio do próprio fade, dando a sobreposição que
      // faz o corredor parecer que "vira" o recap em vez de só sumir e
      // deixar outra tela aparecer depois.
      setTimeout(() => {
        setPhase('exiting')
        signalDone()
      }, CORRIDOR_MS + PODIUM_MS + CELEBRATE_MS),
      setTimeout(() => setVisible(false), CORRIDOR_MS + PODIUM_MS + CELEBRATE_MS + EXIT_MS),
    )

    return () => timersRef.current.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  useEffect(() => {
    if (phase !== 'podium' || confettiFiredRef.current || prefersReducedMotion()) return
    const id = setTimeout(() => {
      confettiFiredRef.current = true
      // não usa getBoundingClientRect() no card -- com o card ainda dentro
      // do container de perspective 3D, o navegador projeta a caixa de
      // forma inconsistente (rect vinha com coordenadas fora da tela em
      // teste local). A posição final do rank 1 é sempre a mesma (card
      // centralizado, só sobe 48px), então dá pra calcular direto.
      const width = RANK1_WIDTH * RANK1_SCALE
      const height = width * (4 / 3)
      triggerConfettiBurst(
        {
          left: window.innerWidth / 2 - width / 2,
          top: window.innerHeight / 2 - RANK1_LIFT_PX - height / 2,
          width,
          height,
        },
        { colors: CONFETTI_COLORS, count: 34 },
      )
    }, PODIUM_MS)
    return () => clearTimeout(id)
  }, [phase])

  useEffect(() => {
    if (!visible) return
    function onKeyDown(e) {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  if (!visible || !trigger?.recap) return null

  const topGames = trigger.recap.topGames || []
  const podium = topGames.slice(0, 3)

  return (
    <div className={`winner-reveal winner-reveal-${phase}`} aria-hidden="true">
      <div className="winner-reveal-stage">
        {topGames.map((game, index) => {
          const rank = game.rank || index + 1
          const isPodium = rank <= 3
          const slot = fanSlot(rank)
          return (
            <div
              key={game.key}
              className={`winner-reveal-card rank-${rank}${isPodium ? '' : ' is-extra'}`}
              style={{ '--i': slot, '--depth': Math.abs(slot) }}
            >
              {game.image ? (
                <img className="winner-reveal-thumb" src={game.image} alt="" />
              ) : (
                <div className="winner-reveal-thumb winner-reveal-thumb-placeholder">{initial(game.name)}</div>
              )}
              {isPodium ? (
                <div className="winner-reveal-info">
                  <span className="winner-reveal-rank"><RankBadge rank={rank} /></span>
                  <p className="winner-reveal-name">{game.name}</p>
                  <p className="winner-reveal-total">{formatBRL(game.total)}</p>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {podium[0] ? <p className="winner-reveal-headline">Vencedor: {podium[0].name}!</p> : null}
      {showSkip && phase !== 'exiting' ? (
        <button className="btn-mini winner-reveal-skip" type="button" onClick={finish}>
          pular
        </button>
      ) : null}
    </div>
  )
}
