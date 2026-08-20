import CopyButton from '../CopyButton.jsx'

export default function WidgetObsTab({ data }) {
  const link = data.latestLeilao ? `${location.origin}${data.latestLeilao.alertUrl}` : null

  return (
    <section className="perfil-section">
      <section className="perfil-card">
        <p className="perfil-card-label">widget pro OBS</p>
        <p className="perfil-card-hint">
          Cole esse link como Browser Source no OBS (ou similar) pra ver os alertas de doação na tela, com transparência.
        </p>

        {link ? (
          <div>
            <div className="perfil-field-row">
              <input type="text" readOnly value={link} />
              <CopyButton value={link} />
            </div>
            <p className="perfil-card-footnote">Leilão: {data.latestLeilao.title}</p>
            {(data.leilaoCount || 0) > 1 ? (
              <p className="perfil-card-footnote">
                Esse é o link do seu leilão mais recente. Se quiser o de outro, veja em <a href="/painel">seu painel</a>.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="perfil-obs-empty">
            Você ainda não tem um leilão criado. Crie um em <a href="/">Criar leilão</a> pra gerar seu link do widget.
          </div>
        )}
      </section>
    </section>
  )
}
