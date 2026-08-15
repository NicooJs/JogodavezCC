import { useEffect, useRef, useState } from 'react'

export default function PresenterLoginModal({ open, onClose, onLogin }) {
  const inputRef = useRef(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setError(null)
    const id = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(id)
  }, [open])

  if (!open) return null

  const submit = async (e) => {
    e.preventDefault()
    if (!password) return
    setSubmitting(true)
    try {
      await onLogin(password)
    } catch (err) {
      setError(err.message)
      inputRef.current?.select()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" autoComplete="off" onSubmit={submit}>
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="modal-head">
          <div className="modal-head-text">
            <p className="modal-eyebrow">modo apresentador</p>
            <h2 className="modal-title">Entrar com código</h2>
            <p className="modal-current">Peça o código de acesso pro streamer: ele gera um novo toda vez que precisa te dar entrada.</p>
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">código</label>
          <input
            ref={inputRef}
            type="text"
            className="modal-input"
            placeholder="XXXXXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="btn-mini" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-mini primary" type="submit" disabled={submitting}>Entrar</button>
        </div>
      </form>
    </div>
  )
}
