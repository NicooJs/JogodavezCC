import { useEffect, useRef, useState } from 'react'
import { presenterFetch } from '../lib/api.js'
import { formatBRL, initial } from '../lib/format.js'

// lote (jogo/filme) pra lançar ou editar -- reaproveitado tanto pelo lápis
// de editar no card do catálogo quanto pela busca da barra do apresentador
// (o `game` passado pode ser um item já existente do catálogo ou só
// {name, image} pra um lote novo ainda não lançado)
export default function LotModal({ leilaoId, game, donorNames, onClose, onRenamed }) {
  const amountRef = useRef(null)
  const [action, setAction] = useState('add')
  const [amount, setAmount] = useState('')
  const [donor, setDonor] = useState('')
  const [donorSuggestionsOpen, setDonorSuggestionsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renameImage, setRenameImage] = useState(undefined)
  const [renameResults, setRenameResults] = useState(null)
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [currentGame, setCurrentGame] = useState(game)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    setCurrentGame(game)
    setAction('add')
    setAmount('')
    setDonor('')
    setRenaming(false)
    const id = setTimeout(() => amountRef.current?.focus(), 40)
    return () => clearTimeout(id)
  }, [game])

  useEffect(() => {
    if (!renaming) return
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    const query = renameName.trim()
    if (query.length < 2) {
      setRenameResults(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      presenterFetch(leilaoId, `/admin/game-search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((data) => setRenameResults((data && data.results) || []))
        .catch((err) => {
          if (err.name !== 'AbortError') console.error('Erro ao buscar sugestões:', err.message)
        })
    }, 200)
    return () => clearTimeout(debounceRef.current)
  }, [renameName, renaming, leilaoId])

  if (!currentGame) return null

  const existing = currentGame.key != null && currentGame.total != null

  const startRename = () => {
    setRenameName(currentGame.name)
    setRenameImage(undefined)
    setRenameResults(null)
    setRenaming(true)
  }

  const saveRename = async () => {
    const name = renameName.trim()
    if (!name) return
    setRenameSubmitting(true)
    try {
      const { game: updated } = await presenterFetch(leilaoId, '/admin/rename', {
        method: 'POST',
        body: JSON.stringify({ key: currentGame.key, newName: name, image: renameImage }),
      })
      setCurrentGame({ ...currentGame, key: updated.key, name: updated.name, image: updated.image_url || null })
      onRenamed?.(currentGame.key, updated)
      setRenaming(false)
    } catch (err) {
      alert(err.message)
    } finally {
      setRenameSubmitting(false)
    }
  }

  const submit = async () => {
    if (!amount || Number(amount) <= 0) {
      amountRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      await presenterFetch(leilaoId, '/admin/manual-entry', {
        method: 'POST',
        body: JSON.stringify({ name: currentGame.name, amount, action, username: donor.trim() }),
      })
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const donorMatches = (() => {
    const q = donor.trim().toLowerCase()
    let matches = donorNames || []
    if (q) matches = matches.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
    return matches.slice(0, 6)
  })()

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="modal-head">
          {currentGame.image ? <img className="modal-thumb" src={currentGame.image} alt="" /> : null}
          <div className="modal-head-text">
            <p className="modal-eyebrow">{existing ? 'editar lote' : 'novo lote'}</p>
            <h2 className="modal-title">{currentGame.name}</h2>
            {existing && !renaming ? <p className="modal-current">total atual: {formatBRL(currentGame.total)}</p> : null}
          </div>
          {existing && !renaming ? (
            <button className="modal-title-edit" type="button" aria-label="Renomear" title="Renomear" onClick={startRename}>
              <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3.5l3.5 3.5L6.5 17 2.5 17.5 3 13.5 13 3.5z" /><path d="M11.3 5.2l3.5 3.5" /></svg>
            </button>
          ) : null}
        </div>

        {renaming ? (
          <div className="modal-field">
            <label className="modal-label">Renomear</label>
            <input
              type="text"
              className="modal-input"
              autoComplete="off"
              autoFocus
              value={renameName}
              onChange={(e) => {
                setRenameImage(undefined)
                setRenameName(e.target.value)
              }}
              onKeyDown={(e) => e.key === 'Enter' && saveRename()}
            />
            {renameResults !== null ? (
              <div className="game-shelf">
                {renameResults.length === 0 ? (
                  <p className="game-shelf-empty">nenhum resultado, o nome digitado será usado do jeito que está</p>
                ) : (
                  renameResults.map((item) => (
                    <div
                      className={`game-shelf-card${renameName === item.name && renameImage === (item.image || null) ? ' selected' : ''}`}
                      key={item.name}
                      onClick={() => {
                        setRenameName(item.name)
                        setRenameImage(item.image || null)
                      }}
                    >
                      {item.image ? (
                        <img className="game-shelf-cover" src={item.image} alt="" loading="lazy" />
                      ) : (
                        <div className="game-shelf-cover game-shelf-cover-placeholder">{initial(item.name)}</div>
                      )}
                      <span className="game-shelf-name">{item.name}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
            <div className="modal-actions">
              <button className="btn-mini" type="button" onClick={() => setRenaming(false)}>Cancelar</button>
              <button className="btn-mini primary" type="button" disabled={renameSubmitting} onClick={saveRename}>Salvar nome</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="modal-field">
              <span className="modal-label">ação</span>
              <div className="seg">
                <button type="button" className={action === 'add' ? 'active' : ''} onClick={() => setAction('add')}>Apoiar (+)</button>
                <button type="button" className={action === 'remove' ? 'active' : ''} onClick={() => setAction('remove')}>Sabotar (−)</button>
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">valor</label>
              <div className={`amount-wrap modal-amount${action === 'add' ? ' act-add' : ' act-remove'}`}>
                <span className="amount-prefix">R$</span>
                <input
                  ref={amountRef}
                  type="number"
                  placeholder="0,00"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">doador <span className="modal-opt">(opcional)</span></label>
              <div className="field-wrap">
                <input
                  type="text"
                  className="modal-input"
                  placeholder="nome de quem doou"
                  autoComplete="off"
                  value={donor}
                  onChange={(e) => setDonor(e.target.value)}
                  onFocus={() => setDonorSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setDonorSuggestionsOpen(false), 120)}
                />
                {donorSuggestionsOpen && donorMatches.length > 0 ? (
                  <div className="suggestions donor-suggestions">
                    {donorMatches.map((n) => (
                      <div
                        className="suggestion-item donor-suggestion"
                        key={n}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setDonor(n)
                          setDonorSuggestionsOpen(false)
                        }}
                      >
                        <span className="suggestion-name">{n}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-mini" type="button" onClick={onClose}>Cancelar</button>
              <button className="btn-mini primary" type="button" disabled={submitting} onClick={submit}>Lançar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
