import { formatBRL, initial } from '../lib/format.js'
import { RankBadge, TwitchIcon } from './icons.jsx'

function Thumb({ item }) {
  if (item.image) return <img className="lot-thumb" src={item.image} alt="" loading="lazy" />
  return <div className="lot-thumb lot-thumb-placeholder"><TwitchIcon /></div>
}

// versão parada do LotCard.jsx (board ao vivo) pro recap -- mesma
// estrutura/CSS visual (capa, medalha, nome, valor, top doador), sem nada
// que só faz sentido num leilão rodando: arrastar pra mesclar, editar,
// barra de progresso da corrida (já decidida, vira só o selo), streak/
// duelo/hype.
export default function RecapLotCard({ item, mediaLabel }) {
  return (
    <div className={`lot-card rank-${item.rank}`}>
      {item.image ? <div className="lot-card-bg" style={{ backgroundImage: `url('${item.image}')` }} /> : null}
      <div className="lot-card-content">
        <span className="lot-rank">
          <RankBadge rank={item.rank} />
        </span>
        <Thumb item={item} />
        <div className="lot-info">
          <p className="lot-name">{item.name}</p>
          <span className="lot-total">{formatBRL(item.total)}</span>
          {item.topDonor && item.topDonor.username ? (
            <div className="lot-top-donor" title={`Quem mais apoiou este ${mediaLabel}`}>
              {item.topDonor.avatar ? (
                <img className="lot-top-donor-avatar" src={item.topDonor.avatar} alt="" loading="lazy" />
              ) : (
                <span className="lot-top-donor-avatar lot-top-donor-avatar-placeholder">{initial(item.topDonor.username)}</span>
              )}
              <span className="lot-top-donor-name">{item.topDonor.username}</span>
            </div>
          ) : null}
        </div>
      </div>
      {item.qualifiedByRace ? (
        <div className="lot-corner">
          <span className="badge-race-qualified" title="Classificado pela meta da corrida, não pelo valor">
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2.5v15" /><path d="M4 3.5c2-1 3.5 1 5.5 0s3.5-1 5.5 0v6c-2-1-3.5 1-5.5 0s-3.5-1-5.5 0z" /></svg>
            {item.raceOrder ? `${item.raceOrder}º a jogar` : 'classificado'}
          </span>
        </div>
      ) : null}
    </div>
  )
}
