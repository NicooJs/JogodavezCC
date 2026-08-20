import { useEffect, useState } from 'react'
import { perfilFetch } from '../../lib/api.js'
import { formatBRL } from '../../lib/format.js'
import { useDialogs } from '../../hooks/useDialogs.jsx'

const PIX_KEY_TYPE_META = {
  aleatoria: { label: 'Aleatória', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', inputMode: 'text' },
  documento: { label: 'CPF/CNPJ', placeholder: 'CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00)', inputMode: 'numeric' },
  celular: { label: 'Celular', placeholder: '(11) 91234-5678', inputMode: 'tel' },
  email: { label: 'Email', placeholder: 'seu@email.com', inputMode: 'email' },
}

const STATUS_LABELS = { pending: 'processando', sent: 'enviado', failed: 'falhou' }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// só define a posição inicial do seletor a partir da chave já salva -- não
// bloqueia nada, é uma chave que já passou (ou nunca passou) pela validação
function inferPixKeyType(key) {
  if (!key) return 'aleatoria'
  const trimmed = key.trim()
  if (trimmed.includes('@')) return 'email'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return 'aleatoria'
  const digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+') || (digits.length === 13 && digits.startsWith('55'))) return 'celular'
  if (digits.length === 11 || digits.length === 14) return 'documento'
  return 'aleatoria'
}

// valida o formato certo por tipo e normaliza pro formato que a Efí espera --
// pega erro de digitação na hora de cadastrar em vez de só descobrir quando
// o saque de verdade falhar lá na Efí (ver docs/STATUS-EFI.md)
function normalizePixKey(type, raw) {
  const trimmed = raw.trim()
  if (type === 'email') {
    const email = trimmed.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'E-mail inválido.' }
    return { value: email }
  }
  if (type === 'documento') {
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 14) {
      return { error: 'CPF precisa ter 11 dígitos, CNPJ precisa ter 14 (só números, com ou sem pontuação).' }
    }
    return { value: digits }
  }
  if (type === 'celular') {
    let digits = trimmed.replace(/\D/g, '')
    if (digits.length === 11) digits = '55' + digits
    if (digits.length !== 13 || !digits.startsWith('55')) {
      return { error: 'Celular inválido -- use DDD + número com o 9º dígito, ex: 11912345678.' }
    }
    return { value: `+${digits}` }
  }
  const uuid = trimmed.toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) {
    return { error: 'Chave aleatória precisa ter o formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.' }
  }
  return { value: uuid }
}

function PixggCard({ data }) {
  const { confirmDialog } = useDialogs()
  const [connected, setConnected] = useState(Boolean(data.pixggConnected))
  const [slug, setSlug] = useState(data.pixggConnected ? data.pixggSlug || '' : '')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const onSave = async () => {
    setFeedback(null)
    const trimmedSlug = slug.trim()
    const trimmedId = clientId.trim()
    const trimmedSecret = clientSecret.trim()
    if (!trimmedSlug || !trimmedId || !trimmedSecret) {
      setFeedback({ ok: false, text: 'Preencha usuário, Client ID e Client Secret.' })
      return
    }
    setSaving(true)
    try {
      await perfilFetch('/pixgg', {
        method: 'POST',
        body: JSON.stringify({ pixggSlug: trimmedSlug, clientId: trimmedId, clientSecret: trimmedSecret }),
      })
      setClientSecret('')
      setConnected(true)
      setFeedback({ ok: true, text: 'pixgg.com conectado! O webhook já foi vinculado.' })
    } catch (err) {
      setFeedback({ ok: false, text: `Erro: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const onDisconnect = async () => {
    const ok = await confirmDialog({
      title: 'Desconectar pixgg.com',
      message: 'Suas doações param de redirecionar pra lá até você conectar de novo.',
      confirmLabel: 'Desconectar',
      danger: true,
    })
    if (!ok) return
    setFeedback(null)
    try {
      await perfilFetch('/pixgg/desconectar', { method: 'POST' })
      setSlug('')
      setClientId('')
      setConnected(false)
    } catch (err) {
      setFeedback({ ok: false, text: `Erro: ${err.message}` })
    }
  }

  return (
    <section className="perfil-card perfil-pixgg-card">
      <p className="perfil-card-label">doação via pixgg.com</p>
      <p className="perfil-card-hint">
        Pegue seu Client ID/Secret em{' '}
        <a href="https://dashboard.pixgg.com/aplicacoes" target="_blank" rel="noopener noreferrer">dashboard.pixgg.com/aplicacoes</a>.
      </p>
      <div className="perfil-field-row">
        <input type="text" placeholder="seu nome de usuário no pixgg.com" autoComplete="off" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </div>
      <div className="perfil-field-row">
        <input type="text" placeholder="Client ID" autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </div>
      <div className="perfil-field-row">
        <input type="password" placeholder="Client Secret" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        <button className="btn-mini primary" type="button" disabled={saving} onClick={onSave}>{connected ? 'Atualizar' : 'Conectar'}</button>
      </div>
      {feedback ? <p className={`perfil-feedback ${feedback.ok ? 'ok' : 'error'}`}>{feedback.text}</p> : null}
      {connected ? <p className="perfil-card-footnote">Conectado como pixgg.com/{slug}</p> : null}
      {connected ? <button className="btn-mini" type="button" onClick={onDisconnect}>Desconectar</button> : null}
    </section>
  )
}

function PixKeyCard({ data }) {
  const { confirmDialog } = useDialogs()
  const [type, setType] = useState(inferPixKeyType(data.pixKey))
  const [value, setValue] = useState(data.pixKey || '')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const meta = PIX_KEY_TYPE_META[type]

  const onSave = async () => {
    setFeedback(null)
    const raw = value.trim()
    if (!raw) return
    const result = normalizePixKey(type, raw)
    if (result.error) {
      setFeedback({ ok: false, text: result.error })
      return
    }
    const ok = await confirmDialog({
      title: 'Trocar chave Pix',
      message: `Confirmar troca da chave Pix pra "${result.value}"? Por segurança, o saque fica bloqueado por 24h depois da troca.`,
      confirmLabel: 'Trocar chave',
    })
    if (!ok) return
    setSaving(true)
    try {
      await perfilFetch('/pix-key', { method: 'POST', body: JSON.stringify({ pixKey: result.value }) })
      setValue(result.value)
      setFeedback({ ok: true, text: 'Chave Pix salva!' })
    } catch (err) {
      setFeedback({ ok: false, text: `Erro: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="perfil-card">
      <p className="perfil-card-label">chave pix</p>
      <p className="perfil-card-hint">
        As doações caem numa conta única da plataforma e ficam guardadas pra você até pedir o saque. Cadastre sua chave Pix pra poder sacar.
      </p>
      <div className="seg perfil-pix-key-type">
        {Object.entries(PIX_KEY_TYPE_META).map(([id, m]) => (
          <button key={id} type="button" className={type === id ? 'active' : ''} onClick={() => { setType(id); setFeedback(null) }}>{m.label}</button>
        ))}
      </div>
      <div className="perfil-field-row">
        <input
          type="text"
          placeholder={meta.placeholder}
          inputMode={meta.inputMode}
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave() }}
        />
        <button id="pix-key-save" className="btn-mini primary" type="button" disabled={saving} onClick={onSave}>Salvar</button>
      </div>
      {feedback ? <p className={`perfil-feedback ${feedback.ok ? 'ok' : 'error'}`}>{feedback.text}</p> : null}
      {data.pixKeyUpdatedAt ? <p className="perfil-card-footnote">última troca: {formatDate(data.pixKeyUpdatedAt)}</p> : null}
    </section>
  )
}

function SaqueHistoryCard({ saques }) {
  return (
    <section className="perfil-card perfil-history-card">
      <p className="perfil-card-label">histórico de saques</p>
      {saques.length === 0 ? (
        <p className="perfil-empty">Nenhum saque pedido ainda.</p>
      ) : (
        <div className="perfil-history-list">
          {saques.map((s) => (
            <div className="perfil-saque-row-wrap" key={s.id}>
              <div className="perfil-saque-row">
                <div className="perfil-saque-row-main">
                  <span className="perfil-saque-value">{formatBRL(s.sentCents / 100)}</span>
                  <span className="perfil-saque-date">{formatDate(s.createdAt)}</span>
                </div>
                <span className="perfil-saque-status" data-status={s.status}>{STATUS_LABELS[s.status] || s.status}</span>
              </div>
              {s.status === 'failed' ? (
                <p className="perfil-saque-reason">Valor devolvido pro saldo. {s.failureReason || 'Não foi possível concluir o envio.'}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function SaldoHero({ data }) {
  const { confirmDialog } = useDialogs()
  const [feedback, setFeedback] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [sentCents, setSentCents] = useState(null)

  const cooldownMs = data.cooldownRemainingMs || 0
  const balanceCents = data.balanceCents || 0
  const disabled = cooldownMs > 0 || !data.pixKey || balanceCents <= 0 || requesting || sentCents !== null

  const onSaque = async () => {
    setFeedback(null)
    const ok = await confirmDialog({
      title: 'Solicitar saque',
      message: `Solicitar saque de ${formatBRL(balanceCents / 100)} pra sua chave Pix?`,
      confirmLabel: 'Solicitar saque',
    })
    if (!ok) return
    setRequesting(true)
    try {
      const result = await perfilFetch('/saque', { method: 'POST' })
      setSentCents(result.sentCents)
      setFeedback({ ok: true, text: `Saque solicitado: ${formatBRL(result.sentCents / 100)}. A confirmação pode levar alguns instantes -- seu saldo atualiza sozinho quando sair.` })
    } catch (err) {
      setFeedback({ ok: false, text: `Erro: ${err.message}` })
    } finally {
      setRequesting(false)
    }
  }

  return (
    <section className="perfil-hero">
      <p className="perfil-card-label">saldo disponível</p>
      <p className="perfil-balance-value">{formatBRL(balanceCents / 100)}</p>
      <div className="perfil-hero-footer">
        <p className="perfil-card-footnote">já arrecadou {formatBRL((data.lifetimeEarnedCents || 0) / 100)} no total</p>
        <button className="btn-mini primary perfil-saque-btn" type="button" disabled={disabled} onClick={onSaque}>Solicitar saque</button>
      </div>
      {cooldownMs > 0 && !feedback ? (
        <p className="perfil-feedback">Chave Pix trocada recentemente -- saque libera em ~{Math.ceil(cooldownMs / 3_600_000)}h, por segurança.</p>
      ) : null}
      {feedback ? <p className={`perfil-feedback ${feedback.ok ? 'ok' : 'error'}`}>{feedback.text}</p> : null}
    </section>
  )
}

export default function FinanceiroTab({ data }) {
  const [saques, setSaques] = useState([])

  useEffect(() => {
    perfilFetch('/saques').then((d) => setSaques(d.saques || [])).catch(() => {})
  }, [])

  return (
    <section className="perfil-section">
      <PixggCard data={data} />

      {/* saldo, chave Pix e saque pela Efí seguem inertes enquanto o
          cadastro de intermediador de pagamentos não é aprovado (ver
          docs/STATUS-EFI.md) -- mesmo tratamento "em breve" que a página
          standalone já usa, não é feature nova escondida. */}
      <div className="perfil-disabled-wrap">
        <p className="perfil-disabled-banner">
          <span className="perfil-soon-badge">Em breve</span>
          Saldo, chave Pix e saque direto por aqui estão a caminho.
        </p>
        <div className="perfil-disabled">
          <SaldoHero data={data} />
          <div className="perfil-grid">
            <PixKeyCard data={data} />
            <SaqueHistoryCard saques={saques} />
          </div>
        </div>
      </div>
    </section>
  )
}
