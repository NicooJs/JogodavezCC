import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { getLeilaoIdFromPath } from './lib/leilaoId.js'

const leilaoId = getLeilaoIdFromPath(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App leilaoId={leilaoId} />
  </StrictMode>,
)
