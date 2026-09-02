// busca o HTML de um entry standalone do Vite (settings/historico/perfil/
// sidebar/board), extrai o <script type="module"> com hash já resolvido
// pelo build, e injeta na página -- usado pelo hub (PainelApp.jsx) pra
// carregar cada bundle React sob demanda, sem duplicar essa lógica em
// cada view. Movido de public/js/painel.js quando a casca do hub virou
// React (2026-09-02).
export function loadStandaloneEntry(htmlPath) {
  return fetch(htmlPath)
    .then((res) => res.text())
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      doc.querySelectorAll('link[rel="modulepreload"]').forEach((link) => {
        const l = document.createElement('link')
        l.rel = 'modulepreload'
        l.href = link.getAttribute('href')
        document.head.appendChild(l)
      })
      const entryScript = doc.querySelector('script[type="module"]')
      return new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.type = 'module'
        s.src = entryScript.getAttribute('src')
        s.onload = resolve
        s.onerror = reject
        document.body.appendChild(s)
      })
    })
}
