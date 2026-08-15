import { useEffect, useMemo, useRef, useState } from 'react'

const TILE_TARGET_PX = 190
const MAX_TILES = 140

function CoverTile({ url, onLoaded }) {
  const [loadedUrl, setLoadedUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setLoadedUrl(url)
      onLoaded()
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [url, onLoaded])

  return (
    <div className="board-cover-bg-tile" style={loadedUrl ? { backgroundImage: `url("${loadedUrl}")` } : undefined} />
  )
}

// porte de board-cover-bg.js vanilla -- tiles de capas de jogo/filme
// aleatórias cobrindo o fundo, com veil escuro por cima pra legibilidade.
// Refaz quando a modalidade (jogos/filmes) muda, já que /api/board-bg-covers
// devolve capas diferentes pra cada uma sem mudar a URL (sem Cache-Control
// de propósito no servidor).
export default function BoardCoverBg({ leilaoId, mode }) {
  const [covers, setCovers] = useState([])
  const revealedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/board-bg-covers?leilaoId=${encodeURIComponent(leilaoId)}`)
      .then((res) => (res.ok ? res.json() : { covers: [] }))
      .then((data) => {
        if (!cancelled) setCovers(Array.isArray(data.covers) ? data.covers.filter(Boolean) : [])
      })
      .catch(() => {
        if (!cancelled) setCovers([])
      })
    return () => {
      cancelled = true
    }
  }, [leilaoId, mode])

  const tiles = useMemo(() => {
    if (!covers.length) return []
    const cols = Math.ceil((window.innerWidth * 1.3) / TILE_TARGET_PX)
    const rows = Math.ceil((window.innerHeight * 1.5) / ((TILE_TARGET_PX * 4) / 3))
    const tileCount = Math.min(cols * rows, MAX_TILES)
    return Array.from({ length: tileCount }, () => covers[Math.floor(Math.random() * covers.length)])
  }, [covers])

  useEffect(() => {
    revealedRef.current = false
    document.body.classList.remove('has-covers')
  }, [tiles])

  if (!tiles.length) return null

  const handleTileLoaded = () => {
    if (revealedRef.current) return
    revealedRef.current = true
    document.body.classList.add('has-covers')
  }

  return (
    <div className="board-cover-bg" aria-hidden="true">
      <div className="board-cover-bg-grid">
        {tiles.map((url, i) => (
          <CoverTile key={i} url={url} onLoaded={handleTileLoaded} />
        ))}
      </div>
      <div className="board-cover-bg-veil" />
    </div>
  )
}
