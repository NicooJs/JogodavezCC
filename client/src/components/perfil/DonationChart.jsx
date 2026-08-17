// port direto do renderDonationChart de public/js/perfil.js (SVG à mão,
// área+linha+gradiente) -- mesma lógica, só em JSX em vez de innerHTML

function formatBRLCompact(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// menor "número redondo" >= maxReais, pra gridline não ficar com escala
// esquisita (ex: máximo 87 -> teto 100, não 87)
function niceCeil(maxReais) {
  if (maxReais <= 0) return 10
  const exp = Math.floor(Math.log10(maxReais))
  const base = Math.pow(10, exp)
  const norm = maxReais / base
  let niceNorm
  if (norm <= 1) niceNorm = 1
  else if (norm <= 2) niceNorm = 2
  else if (norm <= 5) niceNorm = 5
  else niceNorm = 10
  return niceNorm * base
}

export default function DonationChart({ series }) {
  const totalCents = series.reduce((sum, d) => sum + d.cents, 0)
  if (totalCents <= 0) {
    return <p className="perfil-chart-empty">Sem doações nos últimos 30 dias.</p>
  }

  const width = 700
  const height = 220
  const marginLeft = 54
  const marginRight = 10
  const marginTop = 10
  const marginBottom = 24
  const plotWidth = width - marginLeft - marginRight
  const plotHeight = height - marginTop - marginBottom

  const maxReais = Math.max(...series.map((d) => d.cents / 100))
  const niceMax = niceCeil(maxReais)

  const xAt = (i) => marginLeft + (i / (series.length - 1)) * plotWidth
  const yAt = (cents) => marginTop + plotHeight - (Math.min(cents / 100, niceMax) / niceMax) * plotHeight

  const linePoints = series.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.cents).toFixed(1)}`)
  const linePath = `M${linePoints.join(' L')}`
  const baseline = (marginTop + plotHeight).toFixed(1)
  const areaPath = `${linePath} L${xAt(series.length - 1).toFixed(1)},${baseline} L${xAt(0).toFixed(1)},${baseline} Z`

  const gridSteps = 4
  const gridlines = []
  for (let s = 0; s <= gridSteps; s++) {
    const value = (niceMax / gridSteps) * s
    const y = yAt(value * 100)
    gridlines.push({ value, y })
  }

  const tickEvery = Math.max(1, Math.round((series.length - 1) / 6))
  const xLabels = []
  for (let i = 0; i < series.length; i += tickEvery) {
    const d = new Date(`${series[i].date}T00:00:00`)
    xLabels.push({ i, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) })
  }

  const lastIdx = series.length - 1

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recebido por dia nos últimos 30 dias">
      <defs>
        <linearGradient id="perfil-chart-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--positive)', stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: 'var(--positive)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {gridlines.map(({ value, y }) => (
        <g key={value}>
          <line className="perfil-chart-gridline" x1={marginLeft} y1={y.toFixed(1)} x2={width - marginRight} y2={y.toFixed(1)} />
          <text className="perfil-chart-axis-label" x={marginLeft - 8} y={(y + 3).toFixed(1)} textAnchor="end">{formatBRLCompact(value)}</text>
        </g>
      ))}
      <path className="perfil-chart-area" d={areaPath} />
      <path className="perfil-chart-line" d={linePath} />
      <circle className="perfil-chart-dot" cx={xAt(lastIdx).toFixed(1)} cy={yAt(series[lastIdx].cents).toFixed(1)} r="3.5" />
      {xLabels.map(({ i, label }) => (
        <text key={i} className="perfil-chart-axis-label" x={xAt(i).toFixed(1)} y={height - 4} textAnchor="middle">{label}</text>
      ))}
    </svg>
  )
}
