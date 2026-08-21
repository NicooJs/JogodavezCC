import App from './App.jsx'

// wrapper fino só pra dar nome próprio no entry (mesmo padrão dos outros
// standalones do hub) -- o componente de verdade é o mesmo App.jsx que
// serve /l/:id, só com embedded=true (ver App.jsx pra tudo que isso desliga)
export default function BoardEmbedStandalone({ leilaoId }) {
  return <App leilaoId={leilaoId} embedded />
}
