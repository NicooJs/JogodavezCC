import { useRef, useState } from 'react'
import { perfilFetch } from '../../lib/api.js'

// aqui só serve pra tocar a prévia local, quem manda de verdade no overlay
// é o alerta.js lendo o mesmo nome via /api/l/:id/alert-config -- mesmo
// mapa de public/js/perfil.js, duplicado de propósito (cada tela já tem
// seus próprios helpers pequenos nesse projeto)
const CHIME_PRESETS = {
  classic: { wave: 'sine', freqs: [660, 880], name: 'Clássico', desc: 'Toque suave, o padrão do site.' },
  arcade: { wave: 'square', freqs: [523, 659, 784], name: 'Arcade', desc: 'Enérgico, arpejo de três notas.' },
  chill: { wave: 'triangle', freqs: [440, 554], name: 'Suave', desc: 'Mais lento e discreto.' },
  bell: { wave: 'sine', freqs: [880, 1108], name: 'Sino', desc: 'Agudo, se destaca no meio do jogo.' },
}
const MAX_CUSTOM_SOUND_SECONDS = 10

function playChimePreview(id) {
  try {
    const preset = CHIME_PRESETS[id] || CHIME_PRESETS.classic
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    preset.freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = preset.wave
      osc.frequency.value = freq
      const t = now + i * 0.09
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.4)
    })
  } catch {
    // sem Web Audio (navegador antigo/bloqueado) -- prévia só não toca
  }
}

export default function AlertaTab({ data }) {
  const [selected, setSelected] = useState(data.alertChime || 'classic')
  const [saved, setSaved] = useState(data.alertChime || 'classic')
  const [customSoundUrl, setCustomSoundUrl] = useState(data.alertCustomSoundUrl || null)
  const [customStatus, setCustomStatus] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const fileInputRef = useRef(null)

  const uploadCustomSound = async (file) => {
    setCustomStatus('Enviando...')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('audio', file)
      const result = await perfilFetch('/alert-sound', { method: 'POST', body: formData })
      setCustomSoundUrl(result.url)
      setSelected('custom')
      setSaved('custom')
      setCustomStatus(null)
    } catch (err) {
      setCustomStatus(`Erro: ${err.message}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const probe = new Audio(URL.createObjectURL(file))
    probe.addEventListener('loadedmetadata', () => {
      if (probe.duration > MAX_CUSTOM_SOUND_SECONDS) {
        setCustomStatus(`Esse áudio tem ${probe.duration.toFixed(1)}s -- o limite é ${MAX_CUSTOM_SOUND_SECONDS}s.`)
        e.target.value = ''
        return
      }
      uploadCustomSound(file)
    })
    probe.addEventListener('error', () => uploadCustomSound(file))
  }

  const onPreview = (id, e) => {
    e.stopPropagation()
    if (id === 'custom') {
      if (customSoundUrl) new Audio(customSoundUrl).play().catch(() => {})
      return
    }
    playChimePreview(id)
  }

  const onSave = async () => {
    setFeedback(null)
    setSaving(true)
    try {
      await perfilFetch('/alert-chime', { method: 'POST', body: JSON.stringify({ chime: selected }) })
      setSaved(selected)
      setFeedback({ ok: true, text: 'Som do alerta salvo! Vale pra todos os seus leilões.' })
    } catch (err) {
      setFeedback({ ok: false, text: `Erro: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const rows = [
    ...Object.entries(CHIME_PRESETS).map(([id, p]) => ({ id, name: p.name, desc: p.desc })),
    {
      id: 'custom',
      name: 'Personalizado',
      desc: customStatus || (customSoundUrl ? 'Áudio enviado.' : 'Nenhum áudio enviado ainda (até 10s, MP3/WAV/OGG).'),
    },
  ]

  return (
    <section className="perfil-section">
      <section className="perfil-card">
        <p className="perfil-card-label">som do alerta</p>
        <p className="perfil-card-hint">
          Vale pra qualquer leilão que você já tem ou vier a criar -- não precisa configurar de novo em cada um.
        </p>

        <div className="perfil-chime-list">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`perfil-chime-row${selected === row.id ? ' selected' : ''}`}
              onClick={() => {
                if (row.id === 'custom' && !customSoundUrl) return
                setSelected(row.id)
              }}
            >
              <span className="perfil-chime-radio" aria-hidden="true" />
              <div className="perfil-chime-text">
                <p className="perfil-chime-name">{row.name}</p>
                <p className="perfil-chime-desc">{row.desc}</p>
              </div>
              {row.id === 'custom' ? (
                <div className="perfil-chime-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg"
                    hidden
                    onChange={onFileChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className="btn-mini"
                    type="button"
                    disabled={uploading}
                    onClick={(e) => {
                      e.stopPropagation()
                      fileInputRef.current?.click()
                    }}
                  >
                    Enviar áudio
                  </button>
                  <button
                    className="btn-mini perfil-chime-preview"
                    type="button"
                    disabled={!customSoundUrl}
                    aria-label="Ouvir Personalizado"
                    onClick={(e) => onPreview('custom', e)}
                  >
                    Ouvir
                  </button>
                </div>
              ) : (
                <button
                  className="btn-mini perfil-chime-preview"
                  type="button"
                  aria-label={`Ouvir ${row.name}`}
                  onClick={(e) => onPreview(row.id, e)}
                >
                  Ouvir
                </button>
              )}
            </div>
          ))}
        </div>

        <button className="btn-mini primary" type="button" disabled={selected === saved || saving} onClick={onSave}>Salvar</button>
        {feedback ? <p className={`perfil-feedback ${feedback.ok ? 'ok' : 'error'}`}>{feedback.text}</p> : null}
      </section>
    </section>
  )
}
