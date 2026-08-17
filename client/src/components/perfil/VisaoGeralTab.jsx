import { formatBRL } from '../../lib/format.js'
import DonationChart from './DonationChart.jsx'

export default function VisaoGeralTab({ data }) {
  return (
    <section className="perfil-section">
      <div className="perfil-stats-row">
        <section className="perfil-stat-card">
          <span className="perfil-stat-icon perfil-stat-icon-accent" aria-hidden="true">
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15.5V11M10 15.5V6.5M16 15.5V9" /></svg>
          </span>
          <div className="perfil-stat-text">
            <p className="perfil-stat-value">{data.donationCount30d}</p>
            <p className="perfil-stat-label">doações recebidas</p>
            <p className="perfil-stat-footnote">últimos 30 dias</p>
          </div>
        </section>

        <section className="perfil-stat-card">
          <span className="perfil-stat-icon perfil-stat-icon-positive" aria-hidden="true">
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 13.5l4.5-5 3 3 5.5-6.5" /><path d="M13 5h3.5v3.5" /></svg>
          </span>
          <div className="perfil-stat-text">
            <p className="perfil-stat-value">{formatBRL(data.donationTotalCents30d / 100)}</p>
            <p className="perfil-stat-label">recebido no período</p>
            <p className="perfil-stat-footnote">últimos 30 dias</p>
          </div>
        </section>
      </div>

      <section className="perfil-card perfil-chart-card">
        <p className="perfil-card-label">recebido por dia</p>
        <div className="perfil-chart-wrap">
          <DonationChart series={data.donationSeries30d || []} />
        </div>
      </section>
    </section>
  )
}
