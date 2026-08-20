import { useEffect, useState } from 'react'
import { perfilFetch } from '../../lib/api.js'
import { formatBRL, initial } from '../../lib/format.js'
import { useDialogs } from '../../hooks/useDialogs.jsx'

const BLOCK_ICON = (
  <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d="M5 5l10 10" /></svg>
)

function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days}d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// cor do avatar é determinística a partir do nome, só pra dar identidade
// visual sem guardar/gerar imagem nenhuma
function avatarVariant(username) {
  const code = String(username || '?').trim().charCodeAt(0) || 0
  return code % 4
}

function DonationsList({ search, setSearch, donations, loading }) {
  const { confirmDialog } = useDialogs()
  const [blockingId, setBlockingId] = useState(null)
  const [rows, setRows] = useState(donations)

  useEffect(() => setRows(donations), [donations])

  const totalCents = rows.reduce((sum, d) => sum + d.valorTotalCents, 0)

  const onBlock = async (donation) => {
    const name = donation.donorUsername || 'Anônimo'
    const ok = await confirmDialog({
      title: 'Bloquear doador',
      message: `Bloquear "${name}"? A pessoa não vai mais conseguir gerar Pix pra doar em nenhum dos seus leilões (bloqueio por nome e pelo IP dessa doação).`,
      confirmLabel: 'Bloquear',
      danger: true,
    })
    if (!ok) return
    setBlockingId(donation.id)
    try {
      await perfilFetch(`/donations/${donation.id}/block`, { method: 'POST' })
      setRows((prev) => prev.map((d) => (d.id === donation.id ? { ...d, blocked: true } : d)))
    } catch (err) {
      alert(err.message)
    } finally {
      setBlockingId(null)
    }
  }

  return (
    <section className="perfil-donations-panel">
      <div className="perfil-donations-summary">
        <p className="perfil-donations-summary-value">{formatBRL(totalCents / 100)}</p>
        <p className="perfil-donations-summary-label">
          {rows.length} doaç{rows.length === 1 ? 'ão' : 'ões'}{search ? ' encontrada(s)' : ''}
        </p>
      </div>
      <div className="perfil-field-row">
        <input type="text" placeholder="Buscar por nome" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <p className="perfil-empty">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="perfil-empty">Nenhuma doação ainda.</p>
      ) : (
        <div className="perfil-donation-list">
          {rows.map((d) => {
            const name = d.donorUsername || 'Anônimo'
            return (
              <div className="perfil-donation-row" data-blocked={d.blocked} key={d.id}>
                <span className="perfil-donation-avatar" data-variant={avatarVariant(name)}>{initial(name)}</span>
                <div className="perfil-donation-main">
                  <div className="perfil-donation-head">
                    <p className="perfil-donation-name">{name}</p>
                    <span className="perfil-donation-value">{formatBRL(d.valorTotalCents / 100)}</span>
                  </div>
                  {d.donorNote ? <p className="perfil-donation-note">"{d.donorNote}"</p> : null}
                  <p className="perfil-donation-date">{formatRelativeTime(d.paidAt)}</p>
                </div>
                {d.blocked ? (
                  <span className="perfil-donation-blocked-badge">Bloqueado</span>
                ) : (
                  <button
                    className="perfil-donation-block-icon"
                    type="button"
                    data-tooltip="Bloquear"
                    disabled={blockingId === d.id}
                    onClick={() => onBlock(d)}
                  >
                    {BLOCK_ICON}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function BlockedList({ blocked, loading, onUnblock }) {
  const [unblockingId, setUnblockingId] = useState(null)

  const handleUnblock = async (id) => {
    setUnblockingId(id)
    try {
      await perfilFetch(`/blocked-donors/${id}/unblock`, { method: 'POST' })
      onUnblock(id)
    } catch (err) {
      alert(err.message)
    } finally {
      setUnblockingId(null)
    }
  }

  if (loading) return <p className="perfil-empty">Carregando…</p>
  if (blocked.length === 0) return <p className="perfil-empty">Ninguém bloqueado.</p>

  return (
    <div className="perfil-blocked-list">
      {blocked.map((b) => (
        <div className="perfil-blocked-row" key={b.id}>
          <div className="perfil-blocked-main">
            <p className="perfil-blocked-name">{b.donorUsername}</p>
            <p className="perfil-blocked-meta">IP {b.donorIp} · bloqueado {formatRelativeTime(b.blockedAt)}</p>
          </div>
          <button className="btn-mini perfil-blocked-unblock" type="button" disabled={unblockingId === b.id} onClick={() => handleUnblock(b.id)}>
            Desbloquear
          </button>
        </div>
      ))}
    </div>
  )
}

export default function DoacoesTab() {
  const [subtab, setSubtab] = useState('lista')
  const [search, setSearch] = useState('')
  const [donations, setDonations] = useState([])
  const [blocked, setBlocked] = useState([])
  const [loadingDonations, setLoadingDonations] = useState(true)
  const [loadingBlocked, setLoadingBlocked] = useState(true)

  useEffect(() => {
    setLoadingDonations(true)
    const id = setTimeout(() => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : ''
      perfilFetch(`/donations${qs}`)
        .then((data) => setDonations(data.donations || []))
        .catch(() => {})
        .finally(() => setLoadingDonations(false))
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    perfilFetch('/blocked-donors')
      .then((data) => setBlocked(data.blocked || []))
      .catch(() => {})
      .finally(() => setLoadingBlocked(false))
  }, [])

  const onUnblock = (id) => {
    setBlocked((prev) => prev.filter((b) => b.id !== id))
  }

  return (
    <section className="perfil-section">
      <div className="perfil-subtabs">
        <button type="button" className={`perfil-subtab${subtab === 'lista' ? ' active' : ''}`} onClick={() => setSubtab('lista')}>Doações</button>
        <button type="button" className={`perfil-subtab${subtab === 'bloqueados' ? ' active' : ''}`} onClick={() => setSubtab('bloqueados')}>Bloqueados</button>
      </div>

      {/* histórico de doação e bloqueio de doador exigem uma linha em
          `payments` no Postgres pra funcionar (é de lá que vem donorIp) --
          enquanto a ponte via pixgg.com for o caminho ativo de doação, o
          webhook dela só atualiza o placar do leilão, nunca grava em
          `payments` (ver commit fd4d45a). Então isso aqui nunca reflete
          doação recente de verdade -- mesmo tratamento "em breve" que a
          página standalone já usa, não é feature nova escondida, é a MESMA
          limitação, só que também precisa existir aqui no hub. */}
      <div className="perfil-disabled-wrap">
        <p className="perfil-disabled-banner">
          <span className="perfil-soon-badge">Em breve</span>
          Histórico de doações e bloqueio de doador direto por aqui estão a caminho.
        </p>
        <div className="perfil-disabled">
          {subtab === 'lista' ? (
            <DonationsList search={search} setSearch={setSearch} donations={donations} loading={loadingDonations} />
          ) : (
            <section className="perfil-card">
              <BlockedList blocked={blocked} loading={loadingBlocked} onUnblock={onUnblock} />
            </section>
          )}
        </div>
      </div>
    </section>
  )
}
