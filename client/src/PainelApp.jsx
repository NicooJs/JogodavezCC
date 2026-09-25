import { useEffect, useRef, useState } from 'react'
import { loadStandaloneEntry } from './lib/standaloneEntry.js'
import { formatBRL } from './lib/format.js'

// casca do hub (antes public/js/painel.js, JS puro) -- orquestra sessão,
// roteamento entre views e montar/desmontar cada bundle React standalone
// (sidebar/config/histórico/perfil/board, ver client/vite.config.js) no
// container certo. O CONTEÚDO de cada view continua sendo uma raiz React
// totalmente separada, montada via window.JogodaVezXxx.mount(containerId,
// ...) -- essa casca só decide QUANDO chamar isso, não vira pai delas.
//
// Os containers (#sidebar-root, #board-root, etc.) são sempre renderizados
// VAZIOS no JSX abaixo, em todo render, pra sempre -- quem preenche é o
// mount() de cada bundle, escrevendo direto no nó real via createRoot
// próprio. Se o JSX tentasse controlar o conteúdo desses containers
// (children condicionais, por exemplo), o React ia tentar reconciliar uma
// árvore que na real pertence a outra raiz React -- ver seedLoadingSplash
// abaixo pro placeholder inicial, que é escrito fora do ciclo de
// reconciliação de propósito.
const LOADING_SPLASH_HTML =
  '<div class="loading-splash"><img class="loading-splash-img" src="/img/loading-mascot.png" alt="" /><p class="loading-splash-text">Carregando…</p></div>'

const VIEW_PATHS = { home: '/painel', leilao: '/painel/leilao', perfil: '/painel/perfil', config: '/painel/config', historico: '/painel/historico' }
function viewForPath(pathname) {
  return Object.keys(VIEW_PATHS).find((name) => VIEW_PATHS[name] === pathname) || null
}

// martelo de leilão e balão de reação com play -- trocados dos ícones
// genéricos de biblioteca (grade/TV) por algo com mais identidade própria,
// pedido explícito do cliente
const ICON_LEILAO = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3.5" width="7" height="3.2" rx="1" transform="rotate(-40 6.5 5.1)" />
    <line x1="8.2" y1="6.8" x2="14.5" y2="13" />
    <line x1="3" y1="11.5" x2="6.3" y2="8.2" />
    <line x1="6" y1="14.5" x2="9.3" y2="11.2" />
    <line x1="4" y1="17" x2="12" y2="17" />
  </svg>
)
const ICON_REACTS = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 5.5a2 2 0 012-2h11a2 2 0 012 2v6a2 2 0 01-2 2H8l-3.5 3v-3H4.5a2 2 0 01-2-2v-6z" />
    <path d="M8.2 6.3l4 2.2-4 2.2V6.3z" fill="currentColor" stroke="none" />
  </svg>
)

export default function PainelApp() {
  const [session, setSession] = useState(null) // null = carregando; depois {loggedIn, ...}
  const [leilao, setLeilao] = useState(null) // { id, url, title, activeSystem, ... } ou null
  const [activeView, setActiveView] = useState('home')
  // resumo rápido do Início -- só os números que já vêm prontos de
  // /api/perfil (mesma rota que a aba Visão geral do Perfil usa), sem rota
  // nova nenhuma
  const [summary, setSummary] = useState(null)

  const mountedRef = useRef({ board: false, settings: false, historico: false, perfil: false })
  const loadPromiseRef = useRef({}) // por painel: promise do script já injetado (só uma vez cada)

  // sessão + leilão, uma vez -- decide a view inicial pela URL (F5 mantém a
  // página), mas Config/Histórico/Leilão exigem leilão -- sem um, cai pro
  // Início silenciosamente (sem alert(), que é só pra clique explícito)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await fetch('/api/session/me').then((r) => r.json()).catch(() => ({ loggedIn: false }))
      if (cancelled) return
      setSession(s)
      if (!s.loggedIn) return

      const [leiloesRes, perfilRes] = await Promise.all([
        fetch('/api/meus-leiloes'),
        fetch('/api/perfil').catch(() => null),
      ])
      const data = leiloesRes.ok ? await leiloesRes.json() : { leiloes: [] }
      if (cancelled) return
      const l = data.leiloes && data.leiloes.length ? data.leiloes[0] : null
      setLeilao(l)
      if (perfilRes && perfilRes.ok) {
        const p = await perfilRes.json()
        if (!cancelled) setSummary(p)
      }

      let initial = viewForPath(location.pathname) || 'home'
      if (!l && initial !== 'home' && initial !== 'perfil') {
        initial = 'home'
        history.replaceState({ view: initial }, '', VIEW_PATHS[initial])
      }
      setActiveView(initial)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onPop = () => setActiveView(viewForPath(location.pathname) || 'home')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // escreve o placeholder de carregando nos 4 containers standalone uma
  // única vez, direto no DOM -- fora do JSX de propósito (ver comentário
  // no topo do arquivo), pra nunca conflitar com o mount() de cada bundle
  useEffect(() => {
    for (const key of ['board', 'settings', 'historico', 'perfil']) {
      const el = document.getElementById(`${key}-root`)
      if (el && !el.innerHTML) el.innerHTML = LOADING_SPLASH_HTML
    }
  }, [])

  const showView = (name) => {
    if (!leilao && name !== 'home' && name !== 'perfil') {
      alert('Crie seu leilão primeiro pra acessar isso.')
      return
    }
    setActiveView(name)
    const path = VIEW_PATHS[name]
    if (path && location.pathname !== path) history.pushState({ view: name }, '', path)
  }

  // leilão desmonta de verdade ao sair (fecha o socket) -- as outras 3
  // views React montam uma vez e ficam vivas escondidas -- decisão
  // deliberada, não muda aqui
  useEffect(() => {
    if (!session?.loggedIn || !leilao) return
    if (activeView === 'leilao') {
      if (mountedRef.current.board) return
      ;(async () => {
        try {
          if (!loadPromiseRef.current.board) loadPromiseRef.current.board = loadStandaloneEntry('/board-app/board.html')
          await loadPromiseRef.current.board
          window.JogodaVezBoardPanel.mount('board-root', leilao.id)
          mountedRef.current.board = true
        } catch {
          const el = document.getElementById('board-root')
          if (el) el.innerHTML = '<p class="empty-state">Não deu pra carregar o leilão agora.</p>'
        }
      })()
    } else if (mountedRef.current.board) {
      window.JogodaVezBoardPanel.unmount()
      mountedRef.current.board = false
      const el = document.getElementById('board-root')
      if (el) el.innerHTML = ''
    }
  }, [activeView, session, leilao])

  useEffect(() => {
    if (activeView !== 'config' || !leilao || mountedRef.current.settings) return
    ;(async () => {
      try {
        if (!loadPromiseRef.current.settings) loadPromiseRef.current.settings = loadStandaloneEntry('/board-app/settings.html')
        await loadPromiseRef.current.settings
        window.JogodaVezSettingsPanel.mount('settings-root', leilao.id)
        mountedRef.current.settings = true
      } catch {
        const el = document.getElementById('settings-root')
        if (el) el.innerHTML = '<p class="empty-state">Não deu pra carregar as configurações agora.</p>'
      }
    })()
  }, [activeView, leilao])

  useEffect(() => {
    if (activeView !== 'historico' || !leilao || mountedRef.current.historico) return
    ;(async () => {
      try {
        if (!loadPromiseRef.current.historico) loadPromiseRef.current.historico = loadStandaloneEntry('/board-app/historico.html')
        await loadPromiseRef.current.historico
        window.JogodaVezHistoricoPanel.mount('historico-root', leilao.id)
        mountedRef.current.historico = true
      } catch {
        const el = document.getElementById('historico-root')
        if (el) el.innerHTML = '<p class="empty-state">Não deu pra carregar o histórico agora.</p>'
      }
    })()
  }, [activeView, leilao])

  // Perfil é por CONTA, não por leilão -- mount() não recebe leilaoId, só
  // exige sessão (não gate de leilão, igual home)
  useEffect(() => {
    if (activeView !== 'perfil' || !session?.loggedIn || mountedRef.current.perfil) return
    ;(async () => {
      try {
        if (!loadPromiseRef.current.perfil) loadPromiseRef.current.perfil = loadStandaloneEntry('/board-app/perfil.html')
        await loadPromiseRef.current.perfil
        window.JogodaVezPerfilPanel.mount('perfil-root')
        mountedRef.current.perfil = true
      } catch {
        const el = document.getElementById('perfil-root')
        if (el) el.innerHTML = '<p class="empty-state">Não deu pra carregar seu perfil agora.</p>'
      }
    })()
  }, [activeView, session])

  // sidebar fica visível o tempo todo (diferente das outras, que montam só
  // sob demanda) -- mount() de novo a cada troca de view só atualiza
  // activeView, re-render comum, a raiz React não é recriada
  useEffect(() => {
    if (!session?.loggedIn) return
    ;(async () => {
      try {
        if (!loadPromiseRef.current.sidebar) loadPromiseRef.current.sidebar = loadStandaloneEntry('/board-app/sidebar.html')
        await loadPromiseRef.current.sidebar
        window.JogodaVezSidebar.mount('sidebar-root', {
          activeView,
          avatarUrl: session?.avatarUrl,
          onNavigate: showView,
          onLogout: async () => {
            const ok = confirm('Sair da conta?')
            if (!ok) return
            await fetch('/api/session/logout', { method: 'POST' }).catch(() => {})
            location.reload()
          },
        })
      } catch {
        // sem sidebar por enquanto, mas o resto do hub continua usável
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, session, leilao])

  const switchSystemAndOpen = async (system) => {
    try {
      await fetch(`/api/l/${leilao.id}/admin/active-system`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system }),
      })
    } catch {
      // segue pro board mesmo assim -- o streamer troca o modo por lá se essa chamada falhar
    }
    showView('leilao')
  }

  if (session === null) return null // aguardando o fetch inicial, evita flash de conteúdo errado

  if (!session.loggedIn) {
    return (
      <div className="hub-logged-out" id="hub-logged-out">
        <p className="hub-title">Entre com a Twitch pra abrir seu painel</p>
        <p className="hub-lede">Leilão, reacts e o que mais vier depois -- tudo fica junto aqui, por conta.</p>
        <a
          className="create-twitch-login"
          id="hub-login-link"
          href={`/auth/twitch/start?returnTo=${encodeURIComponent(viewForPath(location.pathname) ? location.pathname : '/painel')}`}
        >
          <svg className="icon" viewBox="0 0 2400 2800" fill="currentColor" aria-hidden="true"><path d="M500 0 0 500v1800h600v500l500-500h400l900-900V0H500zm1600 1300-400 400h-400l-350 350v-350H500V200h1600v1100z" /><path d="M1700 550h200v600h-200zM1150 550h200v600h-200z" /></svg>
          Continuar com a Twitch
        </a>
      </div>
    )
  }

  const leilaoHref = leilao ? leilao.url : '/'
  const reactsHref = leilao ? leilao.url : '/?sistema=reacts'

  return (
    <div className="hub-shell" id="hub-shell">
      <aside className="hub-sidebar" id="sidebar-root" />

      <main className="hub-main">
        <div className="hub-view" id="view-home" hidden={activeView !== 'home'}>
          <div className="hub-header">
            <p className="hub-eyebrow">JogodaVez</p>
            <h1 className="hub-title" id="hub-greeting">Olá, {session.displayName || session.twitchLogin || ''}</h1>
            <p className="hub-lede">Escolha uma ferramenta pra abrir.</p>
          </div>

          <p className="hub-section-label">Ferramentas</p>
          <div className="hub-content">
            <div className="hub-service-grid" id="hub-service-grid">
              <a
                className="hub-service-card"
                id="hub-card-leilao"
                href={leilaoHref}
                onClick={leilao ? (e) => { e.preventDefault(); switchSystemAndOpen('leilao') } : undefined}
              >
                <div className="hub-service-art tone-leilao">
                  <span className="hub-service-art-icon">{ICON_LEILAO}</span>
                  <img className="hub-service-art-mascot" src="/img/loading-mascot.png" alt="" />
                </div>
                <div className="hub-service-body">
                  <p className="hub-service-name">Leilão</p>
                  <p className="hub-service-desc">{leilao ? 'Voltar pro seu leilão' : 'Ainda não criado -- criar agora'}</p>
                </div>
              </a>
              <a
                className="hub-service-card"
                id="hub-card-reacts"
                href={reactsHref}
                onClick={leilao ? (e) => { e.preventDefault(); switchSystemAndOpen('reacts') } : undefined}
              >
                <div className="hub-service-art tone-reacts">
                  <span className="hub-service-art-icon">{ICON_REACTS}</span>
                  <img className="hub-service-art-mascot" src="/img/loading-mascot.png" alt="" />
                </div>
                <div className="hub-service-body">
                  <p className="hub-service-name">Reacts</p>
                  <p className="hub-service-desc">{leilao ? 'Voltar pros seus reacts' : 'Ainda não criado -- criar agora'}</p>
                </div>
              </a>
              <div className="hub-soon-card">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4v12M4 10h12" /></svg>
                Mais ferramentas em breve
              </div>
            </div>

            {summary ? (
              <div className="hub-summary">
                <div className="hub-summary-card">
                  <span className="hub-summary-icon">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M12.3 7.8a2.3 2.3 0 00-2.3-1.3c-1.5 0-2.5.9-2.5 2s1 1.6 2.5 1.9 2.5.8 2.5 1.9-1 2-2.5 2a2.5 2.5 0 01-2.4-1.4" /><path d="M10 5.3v1.3M10 13.4v1.3" /></svg>
                  </span>
                  <div className="hub-summary-text">
                    <p className="hub-summary-value">{formatBRL((summary.lifetimeEarnedCents || 0) / 100)}</p>
                    <p className="hub-summary-label">arrecadado ao todo</p>
                  </div>
                </div>
                <div className="hub-summary-card">
                  <span className="hub-summary-icon">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17.3l-1.1-1C4.4 12.4 2 10.2 2 7.4 2 5.2 3.7 3.5 5.9 3.5c1.3 0 2.6.6 3.4 1.6.8-1 2.1-1.6 3.4-1.6C15 3.5 16.7 5.2 16.7 7.4c0 2.8-2.4 5-6.9 8.9l-.8.7z" /></svg>
                  </span>
                  <div className="hub-summary-text">
                    <p className="hub-summary-value">{summary.donationCount30d || 0}</p>
                    <p className="hub-summary-label">doações nos últimos 30 dias</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="hub-view" id="view-leilao" hidden={activeView !== 'leilao'}>
          <div id="board-root" />
        </div>

        <div className="hub-view" id="view-perfil" hidden={activeView !== 'perfil'}>
          <div id="perfil-root" />
        </div>

        <div className="hub-view" id="view-config" hidden={activeView !== 'config'}>
          <div className="hub-view-config" id="settings-root" />
        </div>

        <div className="hub-view" id="view-historico" hidden={activeView !== 'historico'}>
          <div id="historico-root" />
        </div>
      </main>
    </div>
  )
}
