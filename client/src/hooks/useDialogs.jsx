import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { presenterFetch } from '../lib/api.js'
import { initial } from '../lib/format.js'

const DialogsContext = createContext(null)

export function useDialogs() {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error('useDialogs precisa estar dentro de <DialogsProvider>')
  return ctx
}

function PromptDialog({ state, onSettle }) {
  const inputRef = useRef(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!state) return
    setValue(state.initialValue || '')
    const id = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 40)
    return () => clearTimeout(id)
  }, [state])

  if (!state) return null

  return (
    <div className="modal-overlay dialog-overlay" onClick={(e) => e.target === e.currentTarget && onSettle(null)}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={() => onSettle(null)}>✕</button>
        <div className="modal-head">
          <div className="modal-head-text">
            <h2 className="modal-title">{state.title}</h2>
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">{state.label}</label>
          <input
            ref={inputRef}
            type={state.inputType || 'text'}
            className="modal-input"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSettle(value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-mini" type="button" onClick={() => onSettle(null)}>Cancelar</button>
          <button className="btn-mini primary" type="button" onClick={() => onSettle(value)}>{state.confirmLabel || 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({ state, onSettle }) {
  const confirmRef = useRef(null)
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!state) return
    const id = setTimeout(() => (state.danger ? cancelRef.current : confirmRef.current)?.focus(), 40)
    return () => clearTimeout(id)
  }, [state])

  if (!state) return null

  return (
    <div className="modal-overlay dialog-overlay" onClick={(e) => e.target === e.currentTarget && onSettle(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={() => onSettle(false)}>✕</button>
        <div className="modal-head">
          <div className="modal-head-text">
            <h2 className="modal-title">{state.title}</h2>
          </div>
        </div>
        <p className="modal-message">{state.message}</p>
        <div className="modal-actions">
          <button className="btn-mini" type="button" ref={cancelRef} onClick={() => onSettle(false)}>Cancelar</button>
          <button
            className={`btn-mini${state.danger ? ' danger' : ' primary'}`}
            type="button"
            ref={confirmRef}
            onClick={() => onSettle(true)}
          >
            {state.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RenameGameDialog({ state, leilaoId, onSettle }) {
  const inputRef = useRef(null)
  const [name, setName] = useState('')
  const [image, setImage] = useState(undefined)
  const [results, setResults] = useState(null)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!state) return
    setName(state.initialName || '')
    setImage(undefined)
    setResults(null)
    const id = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 40)
    return () => clearTimeout(id)
  }, [state])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    const query = name.trim()
    if (query.length < 2) {
      setResults(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      presenterFetch(leilaoId, `/admin/game-search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((data) => setResults((data && data.results) || []))
        .catch((err) => {
          if (err.name !== 'AbortError') console.error('Erro ao buscar sugestões:', err.message)
        })
    }, 200)
    return () => clearTimeout(debounceRef.current)
  }, [name, leilaoId])

  if (!state) return null

  const confirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSettle({ name: trimmed, image })
  }

  return (
    <div className="modal-overlay dialog-overlay" onClick={(e) => e.target === e.currentTarget && onSettle(null)}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={() => onSettle(null)}>✕</button>
        <div className="modal-head">
          <div className="modal-head-text">
            <h2 className="modal-title">{state.title || 'Renomear jogo'}</h2>
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">Nome</label>
          <input
            ref={inputRef}
            type="text"
            className="modal-input"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setImage(undefined)
              setName(e.target.value)
            }}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
          />
        </div>
        {results !== null ? (
          <div className="game-shelf">
            {results.length === 0 ? (
              <p className="game-shelf-empty">nenhum resultado, o nome digitado será usado do jeito que está</p>
            ) : (
              results.map((item) => (
                <div
                  className={`game-shelf-card${image === (item.image || null) && name === item.name ? ' selected' : ''}`}
                  key={item.name}
                  onClick={() => {
                    setName(item.name)
                    setImage(item.image || null)
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
          <button className="btn-mini" type="button" onClick={() => onSettle(null)}>Cancelar</button>
          <button className="btn-mini primary" type="button" onClick={confirm}>{state.confirmLabel || 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

export function DialogsProvider({ leilaoId, children }) {
  const [promptState, setPromptState] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [renameState, setRenameState] = useState(null)
  const resolveRef = useRef(null)

  const promptDialog = useCallback(({ title, label, initialValue = '', inputType = 'text', confirmLabel = 'Salvar' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setPromptState({ title, label, initialValue, inputType, confirmLabel })
    })
  }, [])

  const confirmDialog = useCallback(({ title, message, confirmLabel = 'Confirmar', danger = false } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setConfirmState({ title, message, confirmLabel, danger })
    })
  }, [])

  const renameGameDialog = useCallback((initialName, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setRenameState({ initialName, title: options.title, confirmLabel: options.confirmLabel })
    })
  }, [])

  const settlePrompt = (result) => {
    setPromptState(null)
    resolveRef.current?.(result)
    resolveRef.current = null
  }
  const settleConfirm = (result) => {
    setConfirmState(null)
    resolveRef.current?.(result)
    resolveRef.current = null
  }
  const settleRename = (result) => {
    setRenameState(null)
    resolveRef.current?.(result)
    resolveRef.current = null
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (promptState) return settlePrompt(null)
      if (confirmState) return settleConfirm(false)
      if (renameState) return settleRename(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [promptState, confirmState, renameState])

  return (
    <DialogsContext.Provider value={{ promptDialog, confirmDialog, renameGameDialog }}>
      {children}
      <PromptDialog state={promptState} onSettle={settlePrompt} />
      <ConfirmDialog state={confirmState} onSettle={settleConfirm} />
      <RenameGameDialog state={renameState} leilaoId={leilaoId} onSettle={settleRename} />
    </DialogsContext.Provider>
  )
}
