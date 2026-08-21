// Trilha vertical de navegação compartilhada entre o hub (/painel) e o
// board (dentro de SystemSwitch.jsx) -- puramente apresentacional, não sabe
// se está rodando num contexto ou no outro. `children` (opcional) é um slot
// livre entre a marca e os itens de navegação, usado hoje só pelo board pro
// toggle Leilão/Reacts (que é um controle, não navegação -- fica fora dos
// `items` de propósito, ver plano).
export default function NavRail({ hidden, brand, items, footer, children }) {
  return (
    <div className="nav-rail" hidden={hidden}>
      {brand ? (
        brand.href ? (
          <a className="nav-rail-brand" href={brand.href} title={brand.title}>
            <img src={brand.iconSrc} alt={brand.title || ''} />
          </a>
        ) : (
          <span className="nav-rail-brand" title={brand.title}>
            <img src={brand.iconSrc} alt={brand.title || ''} />
          </span>
        )
      ) : null}

      {children ? (
        <>
          {children}
          <span className="nav-rail-sep" aria-hidden="true" />
        </>
      ) : null}

      <nav className="nav-rail-nav">
        {items.map((item) =>
          item.href ? (
            <a
              key={item.key}
              className={`nav-rail-item${item.active ? ' active' : ''}`}
              href={item.href}
              title={item.title}
              aria-label={item.title}
            >
              {item.icon}
            </a>
          ) : (
            <button
              key={item.key}
              className={`nav-rail-item${item.active ? ' active' : ''}`}
              type="button"
              title={item.title}
              aria-label={item.title}
              onClick={item.onClick}
            >
              {item.icon}
            </button>
          )
        )}
      </nav>

      <span className="nav-rail-spacer" aria-hidden="true" />

      {footer ? (
        <FooterButton {...footer} />
      ) : null}
    </div>
  )
}

function FooterButton({ title, avatarUrl, href, onClick, target, showExitBadge }) {
  const content = (
    <>
      {avatarUrl ? (
        <img className="nav-rail-avatar" src={avatarUrl} alt="" />
      ) : (
        <span className="nav-rail-avatar nav-rail-avatar-placeholder">?</span>
      )}
      {showExitBadge ? (
        <span className="nav-rail-avatar-exit" aria-hidden="true">
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.5 3.5h-3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3" />
            <path d="M13 13.5l3.5-3.5-3.5-3.5" />
            <path d="M16.3 10H8" />
          </svg>
        </span>
      ) : null}
    </>
  )

  if (href) {
    return (
      <a className="nav-rail-footer" href={href} target={target} rel={target ? 'noopener' : undefined} title={title} aria-label={title}>
        {content}
      </a>
    )
  }

  if (onClick) {
    return (
      <button className="nav-rail-footer" type="button" title={title} aria-label={title} onClick={onClick}>
        {content}
      </button>
    )
  }

  // nem href nem onClick -- ainda mostra o avatar (ex: apresentador
  // moderador vendo o próprio ícone), só que sem interação nenhuma, mesmo
  // comportamento do <a href={undefined}> de antes em SystemSwitch.jsx
  return (
    <span className="nav-rail-footer" title={title} aria-label={title}>
      {content}
    </span>
  )
}
