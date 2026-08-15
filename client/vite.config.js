import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// board novo (React) -- constrói pra dentro de public/board-app, que já
// cai no express.static(public/) existente no server.js, sem precisar de
// nenhuma rota nova só pra servir os assets. Em dev, proxy pro Express
// (localhost:3000) que já está rodando, pra REST/Socket.IO/uploads
// funcionarem com HMR sem precisar duplicar nada do backend.
// base "/board-app/" só no build de produção -- o index.html sai daqui e é
// servido em /l/:id (fora de /board-app/), mas os assets (JS/CSS) moram
// fisicamente em public/board-app/assets/. Sem isso as tags <script>/<link>
// do build apontariam pra /assets/... (raiz), que não existe. Em dev isso
// ficaria errado do outro jeito -- quem serve ali é o Vite direto na raiz
// (é assim que /l/:id é testado localmente, ver client/README ou a sessão
// de QA), então o base continua "/" em dev.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/board-app/' : '/',
  build: {
    outDir: path.resolve(import.meta.dirname, '../public/board-app'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/uploads': 'http://localhost:3000',
      '/css': 'http://localhost:3000',
      '/favicon.png': 'http://localhost:3000',
      '/favicon-32.png': 'http://localhost:3000',
      '/favicon-180.png': 'http://localhost:3000',
    },
  },
}))
