import { useState } from 'react'
import CopyButton from './CopyButton.jsx'

export default function ModCodeModal({ code, onClose }) {
  const [visible, setVisible] = useState(false)

  if (!code) return null

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="modal-head">
          <div className="modal-head-text">
            <p className="modal-eyebrow">código pra moderador</p>
            <h2 className="modal-title">Código gerado</h2>
            <p className="modal-current">Código de uso único.</p>
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">código de acesso</label>
          <div className="mod-code-row">
            <input type={visible ? 'text' : 'password'} className="modal-input" readOnly autoComplete="off" value={code} />
            <button
              className={`btn-mini${visible ? ' active' : ''}`}
              type="button"
              title={visible ? 'Esconder código' : 'Mostrar código'}
              aria-label={visible ? 'Esconder código' : 'Mostrar código'}
              aria-pressed={String(visible)}
              onClick={() => setVisible(!visible)}
            >
              {visible ? (
                <svg className="icon icon-eye-off" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 2.5l15 15" /><path d="M8.3 5.1C8.85 4.9 9.4 4.9 10 4.9c5.5 0 8.5 5.1 8.5 5.1s-1 1.7-2.7 3.3M5.2 6.2C3.2 7.6 1.5 10 1.5 10s3 5.1 8.5 5.1c1.1 0 2.1-.2 3-.6" /><path d="M7.9 8.1a2.5 2.5 0 0 0 3.5 3.5" /></svg>
              ) : (
                <svg className="icon icon-eye" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" /><circle cx="10" cy="10" r="2.5" /></svg>
              )}
            </button>
            <CopyButton value={code} />
          </div>
        </div>
      </div>
    </div>
  )
}
