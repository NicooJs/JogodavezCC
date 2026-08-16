import { useState } from 'react'
import GeneralTab from './settings/GeneralTab.jsx'
import AppearanceTab from './settings/AppearanceTab.jsx'
import GamesTab from './settings/GamesTab.jsx'
import AdvancedTab from './settings/AdvancedTab.jsx'
import { mediaLabelCap } from '../lib/media.js'

const TABS = [
  {
    id: 'geral',
    label: 'Geral',
    icon: (
      <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6" /><path d="M10 3.2v1.8M10 15v1.8M16.8 10h-1.8M5 10H3.2M14.9 5.1l-1.3 1.3M6.4 13.6l-1.3 1.3M14.9 14.9l-1.3-1.3M6.4 6.4L5.1 5.1" /></svg>
    ),
  },
  {
    id: 'aparencia',
    label: 'Aparência',
    icon: (
      <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.3a6.7 6.7 0 1 0 0 13.4c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.7.6-1.3 1.3-1.3h1.6a3.3 3.3 0 0 0 3.3-3.3A6.7 6.7 0 0 0 10 3.3z" /><circle cx="6.8" cy="8.3" r=".9" fill="currentColor" stroke="none" /><circle cx="9.7" cy="6.5" r=".9" fill="currentColor" stroke="none" /><circle cx="12.8" cy="8" r=".9" fill="currentColor" stroke="none" /></svg>
    ),
  },
  {
    id: 'jogos',
    label: (mode) => `${mediaLabelCap(mode)}s`,
    icon: (
      <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.3" y="3.3" width="5.5" height="5.5" rx="1.2" /><rect x="11.2" y="3.3" width="5.5" height="5.5" rx="1.2" /><rect x="3.3" y="11.2" width="5.5" height="5.5" rx="1.2" /><rect x="11.2" y="11.2" width="5.5" height="5.5" rx="1.2" /></svg>
    ),
  },
  {
    id: 'avancado',
    label: 'Avançado',
    icon: (
      <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 2.8l6 2.2v4.3c0 4-2.5 6.9-6 8.2-3.5-1.3-6-4.2-6-8.2V5l6-2.2z" /><path d="M7.2 10l1.8 1.8 3.8-3.8" /></svg>
    ),
  },
]

// conteúdo puro (cabeçalho + abas), sem o wrapper de overlay -- reaproveitado
// tanto pelo modal do board (SettingsModal, abaixo) quanto pelo painel
// standalone do hub (settings-main.jsx), que hospeda isso dentro do próprio
// side-drawer em vez de um modal centralizado por cima do board.
export function SettingsPanelContent({ leilaoId, leaderboard, tab, setTab }) {
  return (
    <>
      <div className="settings-head">
        <div className="settings-head-text">
          <p className="modal-eyebrow">Configurações</p>
          <h2 className="modal-title">Painel do leilão</h2>
        </div>
      </div>

      <div className="settings-shell">
        <div className="settings-nav" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`settings-nav-item${tab === t.id ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={String(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              <span>{typeof t.label === 'function' ? t.label(leaderboard.mode) : t.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-body">
          {tab === 'geral' ? <GeneralTab leilaoId={leilaoId} leaderboard={leaderboard} /> : null}
          {tab === 'aparencia' ? <AppearanceTab leilaoId={leilaoId} leaderboard={leaderboard} /> : null}
          {tab === 'jogos' ? <GamesTab leilaoId={leilaoId} leaderboard={leaderboard} /> : null}
          {tab === 'avancado' ? <AdvancedTab leilaoId={leilaoId} /> : null}
        </div>
      </div>
    </>
  )
}

export default function SettingsModal({ open, onClose, leilaoId, leaderboard }) {
  const [tab, setTab] = useState('geral')

  if (!open) return null

  return (
    <div className="modal-overlay settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>✕</button>
        <SettingsPanelContent leilaoId={leilaoId} leaderboard={leaderboard} tab={tab} setTab={setTab} />
      </div>
    </div>
  )
}
