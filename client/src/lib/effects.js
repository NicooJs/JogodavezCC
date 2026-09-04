// canvas/confete -- porte quase literal das funções imperativas do app.js
// vanilla (buildRecapCanvas, triggerBigWinCelebration etc.), só
// parametrizadas em vez de ler globais do módulo. Decisão do plano de
// migração: essa camada é embrulhada, não reescrita.
import { formatBRL } from './format.js'

const MEDAL_ICON_SVG_RAW =
  '<svg class="medal-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M7.5 11L4.5 17.5L7.3 16.6L9 19L10.8 14.8" fill="currentColor" opacity="0.85"/>' +
  '<path d="M12.5 11L15.5 17.5L12.7 16.6L11 19L9.2 14.8" fill="currentColor" opacity="0.85"/>' +
  '<circle cx="10" cy="7.5" r="5.5" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4"/>' +
  '<rect x="8.6" y="6.1" width="2.8" height="2.8" fill="currentColor" transform="rotate(45 10 7.5)"/></svg>'

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—'
  const totalMin = Math.round(ms / 60000)
  if (totalMin === 0) return '<1min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  return `${h}h${String(m).padStart(2, '0')}`
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function roundRectPathAsym(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r.tl, y)
  ctx.lineTo(x + w - r.tr, y)
  ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr)
  ctx.lineTo(x + w, y + h - r.br)
  ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br)
  ctx.lineTo(x + r.bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl)
  ctx.lineTo(x, y + r.tl)
  ctx.arcTo(x, y, x + r.tl, y, r.tl)
  ctx.closePath()
}
const CARD_CORNER_RADII = [
  { tl: 12, tr: 8, br: 13, bl: 9 },
  { tl: 9, tr: 12, br: 8, bl: 13 },
  { tl: 11, tr: 9, br: 14, bl: 8 },
]

function loadImageSafe(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    const timer = setTimeout(() => resolve(null), 4000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url.startsWith('http') ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url
  })
}

function medalImageDataUri(color) {
  return `data:image/svg+xml;base64,${btoa(MEDAL_ICON_SVG_RAW.replace(/currentColor/g, color))}`
}

function drawCircleImage(ctx, img, cx, cy, size) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  const scale = Math.max(size / img.width, size / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  ctx.restore()
}

function drawGrain(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    if (Math.random() > 0.94) {
      const delta = (Math.random() - 0.5) * 14
      data[i] = Math.min(255, Math.max(0, data[i] + delta))
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + delta))
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + delta))
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo)}…`
}

export async function buildRecapCanvas(recap, leilaoId) {
  if (!recap) return null
  await document.fonts.ready

  const W = 1200
  const H = 630

  const rootStyle = getComputedStyle(document.documentElement)
  const cVar = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback

  const surface = cVar('--surface', '#1e1829')
  const surface2 = cVar('--surface-2', '#251d33')
  const border = cVar('--border', '#3a2f4d')
  const borderSoft = cVar('--border-soft', '#2a2338')
  const textColor = cVar('--text', '#f2eff7')
  const muted = cVar('--muted', '#9891a8')
  const accent = cVar('--accent', '#a683d1')
  const accentBg = cVar('--accent-bg', 'rgba(166,131,209,0.12)')
  const accentText = cVar('--accent-text', '#c3a8dd')
  const accentSoft = cVar('--accent-soft', '#7c5aa8')
  const silver = cVar('--silver', '#d6d0e0')

  const top3 = (recap.topGames || []).slice(0, 3)
  const topDonors = (recap.topDonors || []).slice(0, 5)

  const [coverImgs, donorAvatarImgs, hostAvatarImg, medalGold, medalSilver, medalBronze] = await Promise.all([
    Promise.all(top3.map((g) => loadImageSafe(g.image))),
    Promise.all(topDonors.map((d) => loadImageSafe(d.avatar))),
    loadImageSafe(recap.hostAvatar),
    loadImageSafe(medalImageDataUri(accentText)),
    loadImageSafe(medalImageDataUri(silver)),
    loadImageSafe(medalImageDataUri(cVar('--bronze', '#c99a6c'))),
  ])
  const medalByRank = [medalGold, medalSilver, medalBronze]

  function renderCanvas(includeCovers) {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    roundRectPath(ctx, 0, 0, W, H, 18)
    ctx.fillStyle = surface
    ctx.fill()
    drawGrain(ctx, W, H)
    roundRectPath(ctx, 1, 1, W - 2, H - 2, 18)
    ctx.strokeStyle = border
    ctx.lineWidth = 2
    ctx.stroke()

    const marginX = 56
    const colDivider = 672
    const rightX = colDivider + 34
    const rightW = W - marginX - rightX

    ctx.save()
    ctx.translate(marginX + 6, 54)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = accent
    ctx.fillRect(-5, -5, 10, 10)
    ctx.restore()
    ctx.fillStyle = textColor
    ctx.font = "600 16px 'IBM Plex Sans', sans-serif"
    ctx.textBaseline = 'middle'
    ctx.fillText('JogodaVez', marginX + 22, 54)
    ctx.textBaseline = 'alphabetic'

    ctx.fillStyle = accentText
    ctx.font = "600 12px 'IBM Plex Mono', monospace"
    ctx.textAlign = 'right'
    ctx.fillText('LEILÃO ENCERRADO', W - marginX, 58)
    ctx.textAlign = 'left'

    const hostAvatar = includeCovers ? hostAvatarImg : null
    let titleX = marginX
    if (hostAvatar) {
      const avatarSize = 44
      const avatarCy = 104
      drawCircleImage(ctx, hostAvatar, marginX + avatarSize / 2, avatarCy, avatarSize)
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(marginX + avatarSize / 2, avatarCy, avatarSize / 2, 0, Math.PI * 2)
      ctx.stroke()
      titleX = marginX + avatarSize + 14
    }
    ctx.fillStyle = textColor
    ctx.font = "italic 700 38px 'Nunito', sans-serif"
    const title = recap.title || 'JogodaVez'
    ctx.fillText(truncateToWidth(ctx, title, colDivider - titleX), titleX, 118)

    const totalText = recap.totalRaised === null ? 'oculto' : formatBRL(recap.totalRaised || 0)
    const prefixMatch = totalText.match(/^(R\$\s?)(.+)$/)
    ctx.font = "700 78px 'IBM Plex Mono', monospace"
    if (prefixMatch) {
      ctx.font = "600 30px 'IBM Plex Mono', monospace"
      ctx.fillStyle = accentSoft
      ctx.fillText(prefixMatch[1].trim(), marginX, 226)
      const prefixW = ctx.measureText(`${prefixMatch[1].trim()} `).width
      ctx.font = "700 78px 'IBM Plex Mono', monospace"
      ctx.fillStyle = accentText
      ctx.fillText(prefixMatch[2], marginX + prefixW, 226)
    } else {
      ctx.fillStyle = accentText
      ctx.fillText(totalText, marginX, 226)
    }
    ctx.fillStyle = muted
    ctx.font = "600 13px 'IBM Plex Mono', monospace"
    ctx.fillText('ARRECADADO', marginX + 2, 248)

    const statsRuleY = 270
    ctx.strokeStyle = borderSoft
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(marginX, statsRuleY)
    ctx.lineTo(colDivider, statsRuleY)
    ctx.stroke()

    const stats = [
      [formatDuration(recap.durationMs), 'DURAÇÃO'],
      [String(recap.totalDonors || 0), 'APOIADORES'],
      [String(recap.totalGames || 0), 'LOTES'],
    ]
    const statColW = (colDivider - marginX) / stats.length
    stats.forEach(([value, label], i) => {
      const cx = marginX + statColW * i + statColW / 2
      ctx.textAlign = 'center'
      ctx.fillStyle = textColor
      ctx.font = "600 24px 'IBM Plex Mono', monospace"
      ctx.fillText(value, cx, statsRuleY + 40)
      ctx.fillStyle = muted
      ctx.font = "600 10px 'IBM Plex Mono', monospace"
      ctx.fillText(label, cx, statsRuleY + 60)
      ctx.textAlign = 'left'
    })

    const champion = top3[0]
    const highlightLines = []
    if (champion) highlightLines.push([`${champion.name} foi o campeão`, formatBRL(champion.total)])
    if (recap.biggestDonation) {
      highlightLines.push([
        `recorde: ${recap.biggestDonation.username || 'Anônimo'} em ${recap.biggestDonation.gameName || ''}`,
        formatBRL(recap.biggestDonation.amount),
      ])
    }
    if (highlightLines.length > 0) {
      const hy = statsRuleY + 82
      const boxH = 30 * highlightLines.length + 8
      ctx.fillStyle = accent
      ctx.fillRect(marginX, hy, 3, boxH)
      let ly = hy + 20
      highlightLines.forEach(([label, value]) => {
        ctx.fillStyle = textColor
        ctx.font = "500 14px 'IBM Plex Sans', sans-serif"
        ctx.fillText(truncateToWidth(ctx, label, colDivider - marginX - 150 - 16), marginX + 16, ly)
        ctx.fillStyle = accentText
        ctx.font = "700 15px 'IBM Plex Mono', monospace"
        ctx.textAlign = 'right'
        ctx.fillText(value, colDivider, ly)
        ctx.textAlign = 'left'
        ly += 30
      })
    }

    ctx.fillStyle = muted
    ctx.font = "500 13px 'IBM Plex Mono', monospace"
    ctx.fillText(`${location.origin}/l/${leilaoId}`, marginX, H - 30)

    ctx.fillStyle = muted
    ctx.font = "600 12px 'IBM Plex Mono', monospace"
    ctx.fillText('TOP 3', rightX, 62)

    const MEDAL_ROTATION_DEG = [-5, 4, -3]

    let py = 82
    top3.forEach((game, i) => {
      const isChampion = i === 0
      const cardH = isChampion ? 72 : 60
      const thumbSize = isChampion ? 54 : 46
      roundRectPathAsym(ctx, rightX, py, rightW, cardH, CARD_CORNER_RADII[i])
      if (isChampion) {
        const grad = ctx.createLinearGradient(0, py, 0, py + cardH)
        grad.addColorStop(0, accentBg)
        grad.addColorStop(1, surface2)
        ctx.fillStyle = grad
      } else {
        ctx.fillStyle = surface2
      }
      ctx.fill()
      ctx.strokeStyle = isChampion ? accent : border
      ctx.lineWidth = 1
      ctx.stroke()

      const thumbX = rightX + 10
      const thumbY = py + (cardH - thumbSize) / 2
      const cover = includeCovers ? coverImgs[i] : null
      roundRectPath(ctx, thumbX, thumbY, thumbSize, thumbSize, 8)
      if (cover) {
        ctx.save()
        ctx.clip()
        const scale = Math.max(thumbSize / cover.width, thumbSize / cover.height)
        const dw = cover.width * scale
        const dh = cover.height * scale
        ctx.drawImage(cover, thumbX + (thumbSize - dw) / 2, thumbY + (thumbSize - dh) / 2, dw, dh)
        ctx.restore()
      } else {
        ctx.fillStyle = surface
        ctx.fill()
        ctx.fillStyle = muted
        ctx.font = `italic 700 ${isChampion ? 22 : 20}px 'Nunito', sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((game.name[0] || '?').toUpperCase(), thumbX + thumbSize / 2, thumbY + thumbSize / 2 + 1)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
      }

      const medalImg = medalByRank[i]
      if (medalImg) {
        const medalSize = 22
        ctx.save()
        ctx.translate(thumbX - 8 + medalSize / 2, thumbY - 6 + medalSize / 2)
        ctx.rotate((MEDAL_ROTATION_DEG[i] * Math.PI) / 180)
        ctx.drawImage(medalImg, -medalSize / 2, -medalSize / 2, medalSize, medalSize)
        ctx.restore()
      }

      const textX = thumbX + thumbSize + 14
      const nameMaxW = rightW - (textX - rightX) - 16
      ctx.fillStyle = textColor
      ctx.font = `600 ${isChampion ? 17 : 15}px 'IBM Plex Sans', sans-serif`
      ctx.fillText(truncateToWidth(ctx, game.name, nameMaxW), textX, py + (isChampion ? 30 : 26))
      ctx.fillStyle = accentText
      ctx.font = `700 ${isChampion ? 16 : 14}px 'IBM Plex Mono', monospace`
      ctx.fillText(formatBRL(game.total), textX, py + (isChampion ? 52 : 46))

      py += cardH + 8
    })

    if (topDonors.length > 0) {
      py += 14
      ctx.fillStyle = muted
      ctx.font = "600 12px 'IBM Plex Mono', monospace"
      ctx.fillText('QUADRO DE HONRA', rightX, py + 10)
      py += 28

      const donorAvatarSize = 18
      topDonors.forEach((donor, i) => {
        if (i < 3 && medalByRank[i]) {
          ctx.drawImage(medalByRank[i], rightX, py + 2, 16, 16)
        } else {
          ctx.fillStyle = muted
          ctx.font = "700 12px 'IBM Plex Mono', monospace"
          ctx.fillText(String(i + 1).padStart(2, '0'), rightX, py + 14)
        }

        const donorAvatarImg = includeCovers ? donorAvatarImgs[i] : null
        const avX = rightX + 24
        const avCy = py + 5
        if (donorAvatarImg) {
          drawCircleImage(ctx, donorAvatarImg, avX + donorAvatarSize / 2, avCy, donorAvatarSize)
        } else {
          ctx.beginPath()
          ctx.arc(avX + donorAvatarSize / 2, avCy, donorAvatarSize / 2, 0, Math.PI * 2)
          ctx.fillStyle = surface2
          ctx.fill()
          ctx.fillStyle = muted
          ctx.font = "600 9px 'IBM Plex Sans', sans-serif"
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(((donor.username || '?')[0] || '?').toUpperCase(), avX + donorAvatarSize / 2, avCy + 1)
          ctx.textAlign = 'left'
          ctx.textBaseline = 'alphabetic'
        }

        const nameX = avX + donorAvatarSize + 8
        ctx.fillStyle = textColor
        ctx.font = "500 14px 'IBM Plex Sans', sans-serif"
        ctx.fillText(truncateToWidth(ctx, donor.username || 'Anônimo', rightX + rightW - nameX - 90), nameX, py + 14)
        ctx.fillStyle = muted
        ctx.font = "600 13px 'IBM Plex Mono', monospace"
        ctx.textAlign = 'right'
        ctx.fillText(formatBRL(donor.total), rightX + rightW, py + 14)
        ctx.textAlign = 'left'
        py += 27
      })
    }

    return canvas
  }

  let canvas = renderCanvas(true)
  try {
    canvas.toDataURL('image/png')
  } catch {
    canvas = renderCanvas(false)
  }
  return canvas
}

export function downloadCanvasAsPng(canvas, leilaoId) {
  const link = document.createElement('a')
  link.download = `recap-${leilaoId}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

// confete/faíscas -- mesma lógica de triggerBigWinCelebration/
// triggerStreakIgnite do app.js, recebendo o DOMRect do card já resolvido
// (em vez de fazer querySelector por chave, já que aqui vem de um ref React)
export function triggerConfettiBurst(rect, { colors, count, spark = false, ember = false, spreadY = 0 }) {
  const burst = document.createElement('div')
  burst.className = 'confetti-burst'
  burst.style.left = `${rect.left}px`
  burst.style.top = `${rect.top}px`
  burst.style.width = `${rect.width}px`
  burst.style.height = `${rect.height}px`
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span')
    piece.className = `confetti-piece${spark ? ' confetti-piece-spark' : ''}${ember ? ' confetti-piece-ember' : ''}`
    let angle
    let dist
    if (ember) {
      angle = -90 + (Math.random() * 100 - 50)
      dist = 40 + Math.random() * 90
    } else {
      angle = Math.random() * 360
      dist = 70 + Math.random() * 130
    }
    piece.style.setProperty('--dx', `${Math.cos((angle * Math.PI) / 180) * dist}px`)
    piece.style.setProperty('--dy', `${Math.sin((angle * Math.PI) / 180) * dist - spreadY}px`)
    if (!ember) piece.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`)
    piece.style.left = `${(ember ? 30 : 20) + Math.random() * (ember ? 40 : 60)}%`
    piece.style.top = `${(ember ? 40 : 30) + Math.random() * 30}%`
    piece.style.background = colors[i % colors.length]
    if (ember) piece.style.color = colors[i % colors.length]
    piece.style.animationDuration = `${(ember ? 1.1 : 1.9) + Math.random() * (ember ? 0.5 : 0.7)}s`
    piece.style.animationDelay = `${Math.random() * (ember ? 0.15 : 0.25)}s`
    burst.appendChild(piece)
  }
  document.body.appendChild(burst)
  setTimeout(() => burst.remove(), ember ? 1900 : 2900)
}

// deriva/rotação infinita dos cacos de fundo -- porte de board-bg.js vanilla.
// Retorna uma função de cleanup (StrictMode monta/desmonta o efeito 2x em dev).
export async function animateBoardBg(container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const { animate } = await import('https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm')
  const controls = []
  container.querySelectorAll('.board-bg-shard').forEach((el, i) => {
    const baseOpacity = parseFloat(getComputedStyle(el).opacity) || 0.2
    const duration = 16 + Math.random() * 10
    const driftY = 10 + Math.random() * 14
    const driftX = (Math.random() - 0.5) * 18
    const rotateBy = 45 + (Math.random() - 0.5) * 24

    controls.push(
      animate(
        el,
        {
          y: [0, -driftY, 0],
          x: [0, driftX, 0],
          rotate: [45, rotateBy, 45],
          opacity: [baseOpacity, baseOpacity * 1.5, baseOpacity],
        },
        { duration, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }
      )
    )
  })
  return () => controls.forEach((c) => c.stop())
}
