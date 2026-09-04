import { useEffect, useRef, useState } from 'react'
import { presenterFetch } from '../lib/api.js'
import { mediaLabel, mediaLabelCap } from '../lib/media.js'
import { initial } from '../lib/format.js'
import { useDialogs } from '../hooks/useDialogs.jsx'
import RaceConfigModal from './RaceConfigModal.jsx'
import QualifyCountModal from './QualifyCountModal.jsx'

// lápis vira um mini-menu vertical (ícones empilhados acima do botão) em vez
// de abrir direto a busca -- corrida/zerar/histórico ganharam acesso de 1
// clique a mais, sem competir espaço com o campo de busca no mesmo popover.
// Cada item some o menu e abre a própria coisa (busca continua sendo o
// mesmo popover de sempre, corrida abre modal simples).
export default function PresenterBar({ leilaoId, leaderboard, items, onOpenLotModal, onOpenHistory }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [raceConfigOpen, setRaceConfigOpen] = useState(false)
  const [qualifyCountOpen, setQualifyCountOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)
  const { confirmDialog } = useDialogs()

  const mode = leaderboard.mode
  const media = mediaLabel(mode)
  const Media = mediaLabelCap(mode)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      fetch(`/api/l/${leilaoId}/admin/game-search?q=${encodeURIComponent(q)}`, {
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => {
          setResults(data.results || [])
          setLoading(false)
        })
        .catch((err) => {
          if (err.name !== 'AbortError') console.error('Erro ao buscar sugestões:', err.message)
        })
    }, 150)
    return () => clearTimeout(debounceRef.current)
  }, [query, leilaoId])

  const findExisting = (name) => {
    const norm = name.trim().toLowerCase()
    return items.find((i) => i.name.trim().toLowerCase() === norm) || null
  }

  const pick = (name, image) => {
    setQuery('')
    setResults(null)
    setSearchOpen(false)
    onOpenLotModal(findExisting(name) || { name, image: image || null })
  }

  const submitManual = () => {
    const name = query.trim()
    if (!name) return
    pick(name, null)
  }

  const reset = async () => {
    setMenuOpen(false)
    const ok = await confirmDialog({
      title: 'Zerar leilão',
      message: `Isso apaga TODOS os ${media}s e o histórico desse leilão. Título e host continuam os mesmos. Tem certeza?`,
      confirmLabel: 'Zerar',
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, '/admin/reset', { method: 'POST' })
    } catch (err) {
      alert(err.message)
    }
  }

  const toggleMode = async () => {
    const newMode = mode === 'filmes' ? 'jogos' : 'filmes'
    const label = newMode === 'filmes' ? 'Filmes' : 'Jogos'
    const ok = await confirmDialog({
      title: `Trocar pra ${label}`,
      message: 'Isso zera o catálogo e o histórico atual do leilão, pra não misturar capa buscada de um jeito com a de outro. Título e host continuam os mesmos. Tem certeza?',
      confirmLabel: `Trocar pra ${label}`,
      danger: true,
    })
    if (!ok) return
    try {
      await presenterFetch(leilaoId, '/admin/set-mode', { method: 'POST', body: JSON.stringify({ mode: newMode }) })
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <>
      <button
        className="presenter-fab"
        type="button"
        title="Ferramentas do apresentador"
        aria-label="Ferramentas do apresentador"
        aria-expanded={String(menuOpen)}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.5 3.5a3 3 0 0 1 3.9 3.9l-7.6 7.6-4.3 1 1-4.3 7-7z" /><path d="M11 5l3.5 3.5" /></svg>
      </button>

      {/* fora do menu de propósito -- trocar de modalidade é uma ação rara
          e importante (zera catálogo/histórico), não devia ficar escondida
          atrás do lápis junto com as ferramentas menores */}
      <button
        className="mode-toggle"
        type="button"
        data-mode={mode}
        title={`Modalidade: ${Media}s (clique pra trocar pra ${mode === 'filmes' ? 'Jogos' : 'Filmes'})`}
        aria-label={`Trocar modalidade do leilão pra ${mode === 'filmes' ? 'Jogos' : 'Filmes'}`}
        onClick={toggleMode}
      >
        <span className="mode-toggle-thumb" aria-hidden="true" />
        <span className="mode-toggle-icon mode-toggle-icon-jogos" aria-hidden="true">
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6h8a3 3 0 0 1 3 3.2l-.6 4.5a2 2 0 0 1-3.4 1.2L11.8 13H8.2l-1.2 1.9a2 2 0 0 1-3.4-1.2L3 9.2A3 3 0 0 1 6 6z" /><path d="M6.5 8.3v2.4M5.3 9.5h2.4" /><circle cx="14" cy="8.6" r="0.6" fill="currentColor" stroke="none" /><circle cx="15.3" cy="9.9" r="0.6" fill="currentColor" stroke="none" /></svg>
        </span>
        <span className="mode-toggle-icon mode-toggle-icon-filmes" aria-hidden="true">
          <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5h14V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5z" /><path d="M3 8.5l1.2-4h11.6l1.2 4" /><path d="M6.5 4.5l-1 4M10 4.5l-1 4M13.5 4.5l-1 4" /></svg>
        </span>
      </button>

      {menuOpen ? (
        <div className="presenter-mini-menu" role="menu">
          <button className="presenter-mini-menu-item" type="button" role="menuitem" onClick={() => { setMenuOpen(false); setSearchOpen(true) }}>
            <span className="presenter-mini-menu-icon">
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>
            </span>
            Adicionar lote
          </button>
          <button className="presenter-mini-menu-item" type="button" role="menuitem" onClick={() => { setMenuOpen(false); setRaceConfigOpen(true) }}>
            <span className="presenter-mini-menu-icon">
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2.5v15" /><path d="M4 3.5c2-1 3.5 1 5.5 0s3.5-1 5.5 0v6c-2-1-3.5 1-5.5 0s-3.5-1-5.5 0z" /></svg>
            </span>
            Modo corrida
          </button>
          <button className="presenter-mini-menu-item" type="button" role="menuitem" onClick={() => { setMenuOpen(false); setQualifyCountOpen(true) }}>
            <span className="presenter-mini-menu-icon">
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="4" /><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" /></svg>
            </span>
            Vagas classificadas
          </button>
          <button className="presenter-mini-menu-item" type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenHistory() }}>
            <span className="presenter-mini-menu-icon">
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 5.5V10l3 2" /><circle cx="10" cy="10" r="7" /></svg>
            </span>
            Histórico
          </button>
          <button className="presenter-mini-menu-item danger" type="button" role="menuitem" onClick={reset}>
            <span className="presenter-mini-menu-icon">
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 6h10M8.5 6V4.5h3V6M6.5 6l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" /></svg>
            </span>
            Zerar leilão
          </button>
        </div>
      ) : null}

      {searchOpen ? (
        <section className="presenter-bar presenter-popover">
          <div className="field-wrap presenter-search">
            <svg className="field-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" /><path d="M13 13l5 5" /></svg>
            <input
              autoFocus
              type="text"
              placeholder={`Buscar um ${media} pra lançar…`}
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchOpen(false)
                else if (e.key === 'Enter') submitManual()
              }}
            />
            {results !== null || loading ? (
              <div className="suggestions">
                {loading && results === null ? (
                  <div className="suggestion-loading">buscando "{query.trim()}"…</div>
                ) : (
                  <>
                    {(results || []).map((g) => (
                      <div className="suggestion-item" key={g.name} onClick={() => pick(g.name, g.image)}>
                        {g.image ? (
                          <img className="suggestion-thumb" src={g.image} alt="" loading="lazy" />
                        ) : (
                          <div className="suggestion-thumb suggestion-thumb-placeholder">{initial(g.name)}</div>
                        )}
                        <span className="suggestion-name">{g.name}</span>
                        {g.year ? <span className="suggestion-year">{g.year}</span> : null}
                      </div>
                    ))}
                    <div className="suggestion-item manual" onClick={submitManual}>
                      Adicionar <strong>"{query.trim()}"</strong>
                      <span className="badge-manual">manual</span>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
          <button className="pbar-btn pbar-btn-primary" type="button" title="Usa o texto digitado direto, sem escolher uma sugestão da busca" onClick={submitManual}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>
            Adicionar lote
          </button>
          <button className="pbar-btn pbar-btn-ghost pbar-btn-icon-only" type="button" title="Fechar" aria-label="Fechar" onClick={() => setSearchOpen(false)}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </section>
      ) : null}

      <RaceConfigModal
        leilaoId={leilaoId}
        open={raceConfigOpen}
        raceGoal={leaderboard.raceGoal}
        raceMaxWinners={leaderboard.raceMaxWinners}
        mediaLabel={media}
        onClose={() => setRaceConfigOpen(false)}
      />
      <QualifyCountModal
        leilaoId={leilaoId}
        open={qualifyCountOpen}
        qualifyCount={leaderboard.qualifyCount}
        mediaLabel={media}
        onClose={() => setQualifyCountOpen(false)}
      />
    </>
  )
}
