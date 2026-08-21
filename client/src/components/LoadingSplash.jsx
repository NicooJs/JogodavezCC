// mesma peça visual usada nos placeholders estáticos do hub (painel.html)
// e em doar.html -- ver .loading-splash em style.css
export default function LoadingSplash() {
  return (
    <div className="loading-splash">
      <img className="loading-splash-img" src="/img/loading-mascot.png" alt="" />
      <p className="loading-splash-text">Carregando…</p>
    </div>
  )
}
