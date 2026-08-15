import { useEffect, useState } from 'react'
import { presenterFetch } from '../../lib/api.js'

const THEMES = [
  { id: 'cinza', label: 'Cinza' },
  { id: 'roxo', label: 'Roxo' },
  { id: 'azul', label: 'Azul' },
  { id: 'preto', label: 'Preto' },
  { id: 'verde', label: 'Verde' },
]

export default function AppearanceTab({ leilaoId, leaderboard }) {
  const [bgUrl, setBgUrl] = useState(leaderboard.backgroundImageUrl || '')
  const [file, setFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('')

  useEffect(() => {
    setBgUrl(leaderboard.backgroundImageUrl || '')
  }, [leaderboard.backgroundImageUrl])

  const activeTheme = leaderboard.theme || 'cinza'

  const setTheme = (theme) => {
    presenterFetch(leilaoId, '/admin/theme', { method: 'POST', body: JSON.stringify({ theme }) }).catch((err) => alert(err.message))
  }

  const saveBg = () => {
    presenterFetch(leilaoId, '/admin/background-image', { method: 'POST', body: JSON.stringify({ url: bgUrl.trim() }) }).catch((err) => alert(err.message))
  }

  const clearBg = () => {
    setBgUrl('')
    presenterFetch(leilaoId, '/admin/background-image', { method: 'POST', body: JSON.stringify({ url: '' }) }).catch((err) => alert(err.message))
  }

  const upload = async () => {
    if (!file) return alert('Escolha um arquivo de imagem primeiro')
    const formData = new FormData()
    formData.append('image', file)
    setUploadStatus('Enviando…')
    try {
      await presenterFetch(leilaoId, '/admin/background-image-upload', { method: 'POST', body: formData })
      setUploadStatus('Enviado!')
      setFile(null)
      setTimeout(() => setUploadStatus(''), 2500)
    } catch (err) {
      setUploadStatus(`Erro: ${err.message}`)
    }
  }

  return (
    <div className="settings-panel-group">
      <div className="panel">
        <h2 className="panel-title">Tema visual</h2>
        <p className="hint">A cor de destaque do placar ao vivo.</p>
        <div className="theme-picker">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-swatch${activeTheme === theme.id ? ' active' : ''}`}
              type="button"
              onClick={() => setTheme(theme.id)}
            >
              <span className={`theme-swatch-preview theme-preview-${theme.id}`} />
              {theme.label}
            </button>
          ))}
        </div>
        <div className="panel-row wrap settings-bg-row">
          <input type="text" placeholder="URL de uma imagem (opcional)" autoComplete="off" value={bgUrl} onChange={(e) => setBgUrl(e.target.value)} />
          <button className="tbar-icon-btn" type="button" title="Salvar imagem" aria-label="Salvar imagem" onClick={saveBg}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
          </button>
          <button className="settings-icon-btn" type="button" title="Remover imagem de fundo" aria-label="Remover imagem de fundo" onClick={clearBg}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        <p className="hint">Some atrás do placar, escurecida. Cole o link de uma imagem publicada em algum lugar (Imgur, etc), ou envie um arquivo abaixo.</p>
        <div className="panel-row wrap settings-bg-row">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
          <button className="settings-icon-btn" type="button" title="Enviar arquivo" aria-label="Enviar arquivo" onClick={upload}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13V4" /><path d="M6 7.5L10 4l4 3.5" /><path d="M4 15h12" /></svg>
          </button>
        </div>
        <p className="hint">{uploadStatus}</p>
      </div>
    </div>
  )
}
