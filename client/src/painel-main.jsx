import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PainelApp from './PainelApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PainelApp />
  </StrictMode>,
)
