// mesma extração que o app.js vanilla usa hoje (LEILAO_ID a partir da URL)
export function getLeilaoIdFromPath(pathname) {
  const match = pathname.match(/^\/l\/([a-z0-9_-]+)/i)
  return match ? match[1] : null
}
