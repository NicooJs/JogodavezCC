// mesmo mapeamento de MEDIA_LABELS do app.js vanilla
const MEDIA_LABELS = { jogos: 'jogo', filmes: 'filme' }

export function mediaLabel(mode) {
  return MEDIA_LABELS[mode] || 'jogo'
}

export function mediaLabelCap(mode) {
  const label = mediaLabel(mode)
  return label[0].toUpperCase() + label.slice(1)
}
