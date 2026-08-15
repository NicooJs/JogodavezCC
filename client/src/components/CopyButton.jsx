import { useRef, useState } from 'react'

// espelha wireCopyButton do copy-button.js vanilla
export default function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  const onClick = async () => {
    if (copied) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // sem clipboard API disponível -- sem fallback de seleção aqui porque
      // não temos acesso ao input de origem, só ao valor
    }
  }

  return (
    <button className={`copy-btn${copied ? ' is-copied' : ''}`} type="button" data-tooltip="Copiar" disabled={copied} onClick={onClick}>
      <span className="copy-btn-icon copy-btn-icon-copy" aria-hidden="true">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></svg>
      </span>
      <span className="copy-btn-icon copy-btn-icon-check" aria-hidden="true">
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
      </span>
      <span className="copy-btn-sr">Copiar</span>
    </button>
  )
}
