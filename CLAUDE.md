# JogodaVez (leilao-de-jogos)

Plataforma de leilão de doação ao vivo pra streamers: espectadores doam via Pix,
escolhem um jogo ou filme pra apoiar/sabotar, e um placar público mostra a
disputa em tempo real. Front-end estático (`public/`) + servidor Express +
Socket.IO (`server.js`), estado do leilão em JSON no disco (Volume persistente
no Railway) com cópia de segurança periódica no Postgres.

> Este arquivo é a fonte de continuidade entre sessões/máquinas — mantenha
> atualizado quando decisões de design ou arquitetura mudarem. Ver também
> [docs/STATUS-EFI.md](docs/STATUS-EFI.md) pro status específico da migração
> de pagamento em andamento.

## Estado do pagamento (importante, muda com frequência)

**Mercado Pago foi removido do código (2026-08-01)**. A doação em si (o
dinheiro entrando) hoje passa por uma **ponte via pixgg.com** (reativada em
2026-08-06, `src/pixggApi.js`/`src/pixggClient.js`): o dinheiro cai **direto
na conta do streamer no pixgg.com**, a JogodaVez só escuta o webhook
(`POST /webhooks/pixgg/:secret`) pra atualizar o placar em tempo real —
nunca custodia nem credita ledger nesse caminho. Streamer conecta a própria
aplicação pixgg.com (Client ID/Secret) no Perfil → Financeiro
(`streamerPixggStore`); `doar.html`/`doar.js` redireciona pra lá quando o
streamer tem isso conectado. Isso é uma **ponte temporária** enquanto o
cadastro na Efí como intermediador de pagamentos não é aprovado — não é uma
volta definitiva ao pix.gg, é a Efí que segue sendo o destino final.

**Convenção jogo + recado no mesmo campo (2026-08-21, separador trocado pra
" | " em 2026-08-29)**: o pixgg.com só manda 1 campo de texto livre no
webhook (`Message`), sem separar "jogo escolhido" de "recado pro streamer"
-- doar.js gera `+Jogo | recado` (`-Jogo` sabota), `parseMessage`
(`src/parser.js`) extrai o recado de volta e ele entra no `lastEvent` do
alerta ao vivo normalmente. Sem " | " continua funcionando como sempre (só
jogo, sem recado) -- não quebra doação antiga nem quem digita direto no
pixgg.com sem seguir a convenção. **Separador era "." até 2026-08-29**,
trocado pra " | " porque título de filme em pt-BR usa ponto com frequência
(abreviação tipo "Sr. e Sra. Smith", "Dr. Estranho") -- o primeiro ponto da
mensagem cortava o nome do filme no meio (virava "Sr" + recado bogus "e
Sra. Smith"), bug que só afetava filme, não jogo (raro ter ponto no meio do
nome). Mesmo bug existia em qualquer chamada de `parseMessage` com nome
contendo ponto, não só na ponte pixgg.com -- também batia em lançamento
manual de filme (`POST /admin/manual-entry`) e na rota antiga de doação
direta (`POST /doacao`). Os campos "seu nome"/"voz de IA" saíram do formulário nesse
fluxo (ficam ocultos via JS quando `pixggSlug` existe, voltam se cair) --
quem manda esses de verdade é a própria pixgg.com (nome da conta do doador
lá, voz é lida a partir do texto que ele digita direto no site deles, não
algo controlável por aqui). Doação sem jogo reconhecível (nem convenção nem
`findExistingGameInText`) vira fila de pendência (sino de notificação,
`NotifBell.jsx`), não um card falso no catálogo -- isso já tinha sido
corrigido antes (`3590d2f`, 2026-08-13).

A infraestrutura da **Efí Bank** (custódia numa Conta Master única + ledger
interno no Postgres — `fee_config`, `streamer_balances`, `ledger_entries`,
etc., ver `src/ledgerStore.js`) continua existindo no código e é o que
processa **saldo e saque** do streamer (não a doação em si, enquanto a ponte
via pixgg.com estiver ativa). Não existe mais OAuth por streamer — a
identidade do streamer vem só do vínculo com o Twitch
(`streamersStore.ensureByTwitchUserId`), e ele cadastra uma chave Pix própria
pra receber saque, não pra receber doação direto. **Antes de mexer em
qualquer coisa relacionada a pagamento, leia
[docs/STATUS-EFI.md](docs/STATUS-EFI.md)** — o ambiente ativo (`EFI_ENV`)
por padrão é `homologacao` até a conta de Produção da Efí ser confirmada; não
assuma que o Mercado Pago ainda existe em algum lugar do código.

**Regra permanente**: qualquer código que mexa com dinheiro precisa manter o
mesmo padrão de segurança já usado no projeto — queries sempre parametrizadas
(nunca concatenar SQL), certificado/credencial da Efí só em variável de
ambiente (nunca em disco, nunca commitado), toda rota administrativa/de
saldo autenticada (rotas de saldo/saque exigem `requireLeilaoOwner`, mais
restrito que `requireLeilaoAdmin` — moderador com código de uso único não
pode mexer em dinheiro), webhook sempre com verificação + idempotência
dupla, nunca logar segredo/token/CPF, CPF nunca persistido no nosso banco.
**IDs de tabela são `BIGSERIAL`** (`streamers.id`, `payments.id`,
`withdrawals.id`) — o driver do Postgres devolve isso como string, não
number; todo `rowToX()` precisa converter com `Number()` explicitamente,
senão comparação estrita (`===`) quebra silenciosamente (bug real já visto
e corrigido, ver `docs/STATUS-EFI.md`).

**Confirmação de saque é sempre assíncrona**: `efiApi.enviarPix()` só
confirma que a Efí ACEITOU o pedido (`EM_PROCESSAMENTO`), nunca que o
dinheiro saiu de verdade — o resultado real (`REALIZADO`/`NAO_REALIZADO`)
chega depois, via webhook, ou via `src/reconciliation.js` se o webhook não
chegar (confirmado que a entrega é inconsistente). Nunca marcar um saque
como concluído na resposta síncrona da chamada.

## Sistema de design

### Temas (cor)

5 temas dark, todos em `public/css/style.css:1-96` via `:root[data-theme="..."]`
(2026-08: renomeados de nomes poéticos pra nomes de cor direto, ver
`AVAILABLE_THEMES` em `server.js`). O `:root` puro (sem atributo) é o tema
**"cinza"** (default) — não tem seletor próprio no CSS, é só o rótulo lógico
usado no JS/servidor (`leaderboard.theme || "cinza"`). Os outros 4 (`roxo`,
`azul`, `preto`, `verde`) têm seletor explícito. Existe também um
`:root[data-theme="branco"]` já escrito no CSS (tema claro de verdade, fundo
branco/texto escuro) mas **fora do seletor de temas de propósito** — vários
efeitos "glass" hoje são hardcoded assumindo fundo escuro (ex:
`rgba(255,255,255, baixa-opacidade)` no `.topbar-total`) e quebram sobre fundo
claro; falta uma auditoria desses efeitos antes de reativar. Não usar/expor
`branco` sem antes resolver isso.

Variáveis principais por tema: `--bg`, `--surface`, `--surface-2`, `--border`,
`--border-soft`, `--text`, `--muted`, `--accent`, `--accent-text`,
`--accent-soft`, `--accent-glow`, `--accent-ink`, `--silver`. Constantes
compartilhadas (não variam por tema): `--bronze`, `--danger`, `--danger-bg`,
`--positive`, `--radius: 6px`, `--ease: cubic-bezier(.22,1,.36,1)`, `--grain`
(SVG de ruído em data-URI).

Tema é aplicado via `document.documentElement.dataset.theme = ...` em cada
tela, sincronizado por Socket.IO (`update` → `leaderboard.theme`). Troca de
tema é feita pelo apresentador (dots na presenter-bar ou swatches em
Configurações → Aparência), `POST /admin/theme`. É uma configuração por
**leilão** (guardada no JSON do leilão), não por conta -- o Perfil (que é por
conta) usa como representante o tema do leilão mais recente do streamer,
mesmo critério já usado pro link do widget OBS (`GET /api/perfil` calcula
isso e devolve `theme`, aplicado em `perfil.js`).

Leilões criados antes dessa renomeação têm o tema salvo com as chaves
antigas (`nebulosa`, `recife`, `ametista`, `safira`, `grafite`) -- como
nenhuma delas bate com um `data-theme` válido hoje, o CSS cai pro `:root`
puro (cinza) na próxima vez que carregar. É só estético, decisão consciente
de não migrar automaticamente.

### Tipografia

Google Fonts, mas **não são as mesmas em todas as páginas** — confira o
`<head>` de cada uma antes de assumir. Mapeamento de uso:

- `--font-display: "Nunito"` — títulos de impacto (`.sold-mark`, `.recap-title`, nome do host).
- `--font-title: "Abril Fatface"` — títulos em geral, **exceto no board**, onde é sobrescrito pra `"Fredoka"` só na marca "JogodaVez" (`.board-body .brand-word`).
- `--font-body: "IBM Plex Sans"` — corpo, inputs, botões.
- `--font-mono: "IBM Plex Mono"` — labels em caixa-alta, timer, valores monetários (`font-variant-numeric: tabular-nums`).

`public/fonts/creamy-chicken.otf` existe no repo mas não tem `@font-face`
referenciando em nenhum CSS — parece órfã, candidata a remoção se confirmado.

### Texturas e efeitos

- **Grain**: SVG `feTurbulence` em `--grain`, aplicado global (`body::before`, opacity .035, mix-blend overlay) e em painéis específicos (`background-image + background-blend-mode: overlay`). No canvas do recap (download PNG) é **reimplementado em JS puro** pixel a pixel (`drawGrain()` em `app.js`), não reusa o SVG.
- **Cantos assimétricos**: `.lot-card`, `.game-shelf-card`, `.badge-hit` têm `border-radius` levemente diferente por card, alternado via `:nth-of-type(3n+1/2/3)` — sensação "cortado à mão". Replicado no canvas do recap via `roundRectPathAsym()`.
- **Glow atrás de painel**: `.host-panel::before`/`.timer-panel::before`, radial-gradient + blur, `z-index:0` (não `-1` — proposital, tem comentário no CSS sobre bug de empilhamento já visto).
- **Scrollbar customizada**: fina, thumb invisível por padrão em `.history-list`/`.donor-list`, só aparece no hover do container.
- Outros: `backdrop-filter: blur()` em modais/chip do total; halo cônico animado no total quando sobe; sombra dupla tipo "carimbo" no `.sold-mark`.

### Espaçamento

**Não há escala formal** (tipo `--space-1/2/3`) — é ad-hoc, valores em px
direto nas regras. Só `--radius` e `--ease` são tokens de layout
compartilhados. Ao adicionar CSS novo, seguir a convenção visual existente
(múltiplos de ~2px), não inventar um sistema novo isolado.

### Componentes reutilizáveis

- **`.btn-mini`**: botão base (`.primary`, `.danger`), usado em quase todo modal admin.
- **`.copy-btn`**: ícone copiar→check com cross-fade, lógica em `public/js/copy-button.js` (`wireCopyButton(btn, inputEl)`), tooltip via `[data-tooltip]::after`.
- **`promptDialog`/`confirmDialog`**: **2 implementações separadas, não compartilham módulo** — vanilla `public/js/settings.js` (só o board antigo, `board.html`/`app.js`, ainda vivo enquanto a migração pro React não termina) e React `client/src/hooks/useDialogs.jsx` (board novo canário + hub). Ambas retornam Promise, mesmo padrão de overlay (`.dialog-overlay`, `z-index: 70`, regra em `style.css`). A 3ª implementação que existia em `public/js/perfil.js` foi removida quando o Perfil standalone foi aposentado (ver seção Perfil).
- **Sidebar de navegação com ícone + label dentro de modal**: `.settings-nav`/`.settings-nav-item` em `settings.css`, mesmo visual (ícone + label, estado ativo com fundo sólido na cor de destaque) do padrão `.perfil-nav-item` do Perfil, mas é uma implementação própria escopada ao modal, não reuso direto da classe.
- **`NavRail` (`client/src/components/NavRail.jsx`)** — essa aqui **é** reuso de verdade, exceção ao padrão "mesmo visual, implementações separadas" logo acima: a trilha vertical de ícones do hub (`.hub-sidebar`) e do board (`.system-switch`, dentro de `SystemSwitch.jsx`) são o mesmo componente React, só configurado diferente (itens de navegação real no hub via `SidebarStandalone.jsx`, ver seção Hub; itens que abrem modal + toggle Leilão/Reacts como controle à parte no board). Só existe porque o hub ganhou um 5º entry standalone do Vite (`client/sidebar.html`, mesmo padrão de Configurações/Histórico/Perfil) especificamente pra isso — antes disso a sidebar do hub era vanilla puro e não dava pra compartilhar com o board React.
- **`.loading-splash`** (`style.css`): estado de carregamento genérico -- mascote roxo (`public/img/loading-mascot.png`, flutuação via CSS) + "Carregando…", usado nos placeholders do hub (`painel.html`), em `doar.html` (versão compacta, `.doar-loading .loading-splash-img` menor) e via `LoadingSplash.jsx` nas 3 views React do hub (Perfil/Config/Histórico). Substituiu o texto solto `.hub-modal-loading` (removido). Não é pra loading pequeno dentro de lista já carregada (ex: aba Doações do Perfil), esses continuam texto simples.
- **`.seg`** (segmented control): Apoiar/Sabotar, Sem voz/Com voz.
- **`.game-shelf`**: carrossel horizontal de capas com `scroll-snap` + máscara de fade nas bordas, populado por catálogo local + busca IGDB/TMDB debounced.
- **`.modal`/`.modal-overlay`**: base de todos os diálogos, todos com grain.

### Animações — a maioria é JS/Canvas, não CSS puro

- **Count-up do total**: `animateCountUp()` em `app.js` — `requestAnimationFrame` manual com easing cúbico, não CSS.
- **Swirl/dithering no "Vencedor"**: canvas 2D puro em `app.js` (grade de "pixels" com onda senoidal radial), respeita `prefers-reduced-motion`.
- **Confetti/embers**: DOM + CSS custom properties (`--dx`/`--dy`/`--rot`) consumidas por keyframes — sem lib de partículas.
- **Título com letras↔ícones e flutuação de fundo**: usa a lib **Motion** (`motion@12.42.2`, via CDN ESM `import()`) — `app.js` (título), `board-bg.js` (cacos de fundo), `create-intro.js` (entrada em stagger).
- **Recap pra download**: canvas 2D estático, `buildRecapCanvas()` em `app.js` — desenha tudo manualmente (cantos assimétricos, grain, avatares via `/api/image-proxy` pra evitar CORS), com fallback pra re-renderizar sem imagens se `toDataURL()` falhar por canvas "tainted".

## Telas

### Criação/login (`index.html` + `create.js`)

2 passos: conectar Twitch → título + aceite dos Termos (chave Pix é
cadastrada depois, no Perfil, não bloqueia a criação). `create-intro.js`
anima entrada (lib Motion) e busca `GET /api/ranking` pra mostrar prova
social ("N streamers usando"). Login Twitch é sempre obrigatório pra criar
leilão novo.

Streamer logado que já tem leilão é redirecionado direto pro hub (`/painel`)
ao visitar `/` (`findExistingLeilao()` em `create.js`, via
`/api/meus-leiloes` -- essa rota de API manteve o nome antigo, só a página
`/meus-leiloes` virou `/painel`, com redirect 301 da URL velha) -- não
existe mais o antigo sistema de "leilões criados nesse navegador" em
`localStorage` (era de antes do login com a Twitch existir, ficou
redundante e foi removido). `?novo=1` na URL pula esse redirecionamento
automático e força o formulário a aparecer -- é o que o link "criar novo"
do hub usa, já que sem isso ele simplesmente devolvia o streamer pro
leilão que ele já tinha.

### Hub (`client/src/PainelApp.jsx`, casca virou React em 2026-09-02 -- `public/painel.html`/`painel.js` viram fallback, mesmo padrão do board)

Tela de entrada depois do login -- **por conta, não por leilão** (visual OP.GG
copiado de propósito, paleta roxa própria em `hub.css`, `--hub-accent`
referenciando o mesmo `--nav-accent` que a sidebar do board usa). Grid de
cards de "ferramentas" (hoje só Leilão e Reacts, mais vem depois).

**Navegação é 100% inline, nunca modal/drawer** (decisão revertida
2026-08-16 depois de um round anterior que usava painel lateral deslizante
-- o cliente achou confuso e pediu pra trocar). Cada ícone da sidebar
(Início/Perfil/Configurações/Histórico -- não tem Ranking aqui, isso é
coisa do board, ver mais abaixo) troca o conteúdo de `.hub-main` no lugar:
`showView(name)` em `PainelApp.jsx` esconde todos os `.hub-view` (prop
`hidden` reagindo ao state `activeView`) e mostra só o escolhido -- sem
overlay por cima do resto da tela, sem "sair da tela".

**A sidebar em si virou React (2026-08-21)**, `NavRail` (ver "Componentes
reutilizáveis" acima) -- mesmo componente que o board usa em
`SystemSwitch.jsx`, montado via um 5º entry standalone do Vite
(`client/sidebar.html`, mesmo padrão de Configurações/Histórico/Perfil,
ver abaixo). `painel.html` só tem um container vazio
(`<aside id="sidebar-root">`); `PainelApp.jsx` chama
`window.JogodaVezSidebar.mount("sidebar-root", {activeView, avatarUrl,
onNavigate, onLogout})` num `useEffect` assim que a sessão carrega
(diferente das outras 3 views, que montam só na primeira abertura -- a
sidebar precisa estar visível desde o início) e de novo a cada troca de
view, só pra atualizar `activeView` (reusa a mesma raiz React, não
recria). `showView(name)` continua existindo e fazendo a troca de
verdade; o clique chega nela via callback (`onNavigate`).
**Regra de CSS importante aprendida aqui, vale pra qualquer elemento
escondido por `[hidden]` daqui pra frente**: se o elemento também tem
`display` fixado por classe (ex: `.hub-shell { display: flex }`), essa
regra de classe vence o `[hidden] { display:none }` nativo do navegador por
especificidade -- sempre precisa de um `[hidden] { display: none }`
explícito pro seletor específico (ver `.hub-shell[hidden]`/`.hub-view[hidden]`
em `hub.css`). Já causou um bug real (tela de deslogado aparecendo
"desformatada", com a sidebar/grid vazando por trás do aviso de login).

**Cada view tem seu próprio caminho (2026-08-20), pra sobreviver a um F5**
(`/painel`, `/painel/leilao`, `/painel/perfil`, `/painel/config`,
`/painel/historico`) -- antes disso um F5 em qualquer view que não fosse
Início sempre voltava pro começo, já que a troca é 100% client-side.
`server.js` serve o mesmo `painel.html` (build React, com fallback pro
vanilla se o build faltar -- ver início desta seção) pras 5 rotas
(`app.get(["/painel", "/painel/leilao", "/painel/perfil", ...])`); quem
decide qual view mostrar é `PainelApp.jsx`, lendo `location.pathname`
(`viewForPath()`) em vez de sempre cair no Início. `showView(name)`
também dá `history.pushState` pro caminho correspondente, e um listener
de `popstate` (`useEffect`) restaura a view certa no botão voltar/avançar
do navegador -- sem isso o F5 funcionaria mas voltar/avançar ficaria
quebrado. Config/Histórico/Leilão continuam exigindo um leilão (mesma
guarda que já existia no clique da sidebar); acessar essas URLs direto
sem leilão cai silenciosamente pro Início via `history.replaceState`
(sem o `alert()`, que é só pro clique explícito no meio da navegação). O
link de login (`#hub-login-link`, mostrado só pra deslogado) aponta o
`returnTo` pro caminho atual em vez de sempre `/painel`, então um F5 numa
view específica sem sessão volta pra ela depois do OAuth --
`ALLOWED_RETURN_PATHS` em `server.js` inclui as 5 rotas do hub (allowlist
contra open-redirect, não aceita path arbitrário).

**Avatar da conta (canto inferior da sidebar) desloga ao clicar** (com
confirmação nativa `confirm()` -- não é `confirmDialog`, é uma exceção
deliberada aqui já que esse fluxo referente à sessão não passa por
`presenterFetch`/React) -- tem um selinho vermelho de saída sempre visível
no canto pra não parecer um ícone de "ver meu perfil" (isso já confundiu o
cliente uma vez). "Ver perfil de verdade" é o ícone de pessoa na nav, não
o avatar.

**Bug de clipping no selinho de saída (corrigido 2026-08-30)**: `.nav-rail-avatar-exit`
é posicionado com offset negativo (`bottom:-2px; right:-2px`) de propósito,
pra ficar "pendurado" na borda do círculo do avatar -- só que `.nav-rail-footer`
(o pai) tinha `overflow: hidden` pra deixar a própria foto redonda, e isso
cortava o selinho pela metade (aparência quebrada, tipo um pedaço de círculo
solto). Fix: o `border-radius: 50%` que arredonda a foto foi pro `.nav-rail-avatar`/
`.nav-rail-avatar-placeholder` diretamente, e `overflow: hidden` saiu do
`.nav-rail-footer` -- o selinho (elemento irmão da foto, não filho) deixa de
ser cortado pelo clipping que só precisa valer pra foto em si.

**Não existe mais ícone de "Ranking" separado no hub** (removido
2026-08-16) -- `/api/l/:id/ranking` (por valor) e `/api/l/:id/recap/history`
(por data) puxavam praticamente os mesmos dados (`getPastAuctions()`), só
ordenados diferente; ficaram redundantes uma vez que cada round já mostra
o próprio total. A rota `/api/l/:id/ranking` **continua existindo** no
server -- só não é mais usada pelo hub, o board (`RankingModal.jsx`,
`app.js`) ainda depende dela pro próprio ranking, sem relação com o hub.

**Histórico** (`client/historico.html` + `historico-main.jsx` +
`HistoricoStandalone.jsx`) segue o mesmo padrão de entry-point standalone
que Configurações -- terceiro *entry* do Vite, mesmo mecanismo de
fetch-and-inject (`loadStandaloneEntry()`, `client/src/lib/standaloneEntry.js`,
chamado por `PainelApp.jsx`; fatorado desse módulo compartilhado quando a
casca do hub virou React, 2026-09-02). Visual
inspirado no histórico de partidas do OP.GG: cada round vira uma linha
com data relativa, duração, jogo vencedor em destaque, "roster" dos
outros jogos que competeram naquele round e os top doadores -- tudo já
vinha em `buildRecap()` (`server.js`), não precisou de rota nova. Sidebar
tem um card de resumo geral (total histórico, média por round, melhor
round) e um widget de **"estilo de jogos"** (gênero, somando valor
arrecadado por gênero em todos os rounds -- métrica escolhida foi valor
arrecadado, não "quantas vezes apareceu"). Gênero é capturado de graça na
mesma busca que já resolve a capa do jogo (`getCachedGenre()` em
`src/igdbApi.js`/`src/movieImages.js`, populado como efeito colateral de
`fetchGameImage()`, sem chamada extra à API) e salvo por jogo via
`store.setGameGenre()` -- jogo sem gênero resolvido cai em "Outros" no
agregado (`buildRecap`'s `genreBreakdown`, soma por TODOS os jogos do
round, não só os classificados em `topGames`). Rounds arquivados **antes**
dessa mudança não têm `genreBreakdown` (não migra retroativamente, mesmo
padrão já usado pra troca de nome de tema).

**Exceção deliberada de paleta (2026-08-17)**: diferente do resto do
site, o Histórico copia a cor vermelha da referência OP.GG de propósito
(`--hist-accent`, escopado dentro de `.hist-page` em `historico.css`,
não vaza pro resto do hub) -- autorizado explicitamente pelo cliente,
mesma categoria de exceção que o roxo do hub (`--hub-accent`). O
vermelho é só identidade visual da seção, não representa vitória/derrota
-- um round de leilão não tem isso pro streamer, diferente de uma
partida de LoL. Banner de perfil no topo (`ProfileBanner`, mesmo
`GET /api/perfil` que o Perfil usa: avatar, nome, "streamer desde",
botão "Atualizar" que reconsulta `/api/perfil` + `/recap/history`) e abas
de filtro por modalidade (Todos/Jogos/Filmes, filtra `round.mode`) ficam
sempre visíveis mesmo com a lista vazia, unidas num container só (mesmo
cartão, sem gap) pra imitar o card de invocador do OP.GG. Filtrar
recalcula os widgets da sidebar também (resumo geral e estilo de jogos
são sobre os rounds FILTRADOS, não o total geral) -- não tem filtro de
Reacts ainda, esse sistema não arquiva um histórico de rounds hoje (escopo maior, decisão
consciente de deixar de fora por enquanto).

O wallpaper do banner (lado direito, atrás do degradê) é o banner de
fundo de verdade do canal da Twitch do streamer (a imagem larga que o
streamer configura em "Banner" no Creator Dashboard) -- `channelBannerUrl`
em `GET /api/perfil`, resolvido por `fetchTwitchChannelBanner()`
(`src/twitchClient.js`). **Importante, já foi confundido uma vez**: isso
NÃO é o campo `offline_image_url` da Helix (API oficial) -- esse é a
imagem que aparece *dentro do player* quando offline, coisa diferente.
O banner de fundo do canal nunca foi exposto pela Helix (existia só na
API antiga Kraken v5, desativada há anos, sem substituto oficial) -- a
única forma de conseguir é a API **interna não documentada** que o
próprio site da Twitch usa (`gql.twitch.tv`, campo `bannerImageURL`,
Client-Id público do web client deles `kimne78kx3ncx6brgo4mv6wki5h1ko`,
não é segredo nosso). **Decisão consciente do cliente (2026-08-17),
sabendo do risco**: sem contrato de estabilidade, pode quebrar ou ser
bloqueada pela Twitch sem aviso -- diferente de tudo mais em
`twitchClient.js`, que usa só Helix oficial autenticado com nossas
próprias credenciais. Se quebrar no futuro, cai graciosamente pro
degradê vermelho padrão (`.hist-banner-bg` em `historico.css`) -- o
`style` inline que `ProfileBanner` aplica só existe quando
`channelBannerUrl` vem preenchido, senão a regra CSS de fallback fica de
pé. Query GraphQL usa variável (`$login`), nunca interpolação de string
direto na query -- mesma disciplina de "sempre parametrizado" que o
resto do projeto já segue pra SQL.

**Largura própria (2026-08-17)**: só a view Histórico usa mais espaço
horizontal que o resto do hub -- `.hub-main:has(> #view-historico:not([hidden]))`
em `historico.css` sobe o `max-width` de 1180px (padrão do hub) pra
1640px e reduz o padding esquerdo, pra ficar "colado" na sidebar do hub
igual o OP.GG fica colado na própria barra de ícones. Não mexe nas
outras views (Início/Perfil/Configurações) -- só ativa via `:has()`
quando `#view-historico` é o filho visível.

**Configurações NÃO é iframe do board** (mudou 2026-08-15 a pedido
explícito do cliente: "não quero que abra o leilão, quero que o hub seja
uma interface diferente e independente") -- é um segundo *entry point* do
Vite (`client/settings.html` + `client/src/settings-main.jsx`, ver
`client/vite.config.js`), buildado junto do board pra dentro do mesmo
`public/board-app/`. Reaproveita o componente React de verdade
(`SettingsPanelContent`, extraído de `SettingsModal.jsx` -- o modal do
board só embrulha esse mesmo conteúdo num `.modal-overlay`) sem nunca
montar `App.jsx`/o board inteiro. `PainelApp.jsx` busca `/board-app/settings.html`
sob demanda (só na primeira abertura), extrai o `<script type="module">`
com hash já resolvido pelo Vite e injeta no próprio DOM do hub -- o
`#settings-root` é um container **permanente** dentro da view "config"
(nunca sai do DOM, só fica `hidden`, senão a raiz React seria destruída
toda vez que a view trocasse). `window.JogodaVezSettingsPanel.mount(containerId,
leilaoId)`, exposto pelo entry, é idempotente -- reabrir só re-renderiza a
raiz já existente, preserva estado (ex: aba ativa). CSS específico de
hospedar isso fora do modal (`.hub-view-config .settings-*`) fica em
`settings.css`, não em `hub.css` -- nav da configuração usa
`position: sticky` já que a página inteira rola, não uma caixa de altura
fixa. Esse é o padrão a repetir quando o Perfil for reconstruído do mesmo
jeito (em andamento, seção por seção -- ver `#view-perfil` em
`painel.html`, hoje só um placeholder "chega em breve" pras 4 seções que
ainda não foram portadas pra React).

### Doação (`doar.html` + `doar.js`)

Fluxo: chega em `/l/:id/doar` → conecta Socket.IO (`query:{leilaoId}`) →
formulário (ação apoiar/sabotar, jogo via `game-shelf` com busca IGDB/TMDB,
valor, opcionalmente nome/mensagem/voz TTS atrás de um toggle) → submit
(`POST /api/l/:id/doacao`) → tela de QR Pix + copia-e-cola → **confirmação
só por Socket.IO** (evento `update` com `lastEvent.paymentId` batendo o
pendente), sem polling.

Validações client-side (jogo precisa estar "confirmado" via shelf ou botão
+, valor > 0) são espelhadas no servidor (`server.js`, rota `/doacao`), que
também decide mensagens de erro específicas (chave Pix não cadastrada, conta
restrita/bloqueada, token expirado).

### Board/apresentador (`client/src/App.jsx` React, `board.html`/`app.js` só como fallback)

**Migração pro React terminada em 2026-09-02** (começou 2026-08-14, canário
por leilão até aqui). `server.js` (`GET /l/:id`) agora serve a versão React
(`public/board-app/index.html`, build do `client/`) **pra todo leilão por
padrão**, contanto que o build exista de verdade (`fs.existsSync` -- rede de
segurança: se o build falhar silenciosamente em produção, ver
`package.json` `"build"`, cai pro `board.html` vanilla em vez de dar 404
pra todo mundo). `REACT_BOARD_DISABLED_IDS` (env var, lista de ids separada
por vírgula) é a válvula de escape que sobrou do período de canário --
virou lista de **exclusão**, não mais de inclusão: força um leilão
específico de volta pro vanilla sem precisar reverter o deploy inteiro, se
aparecer um bug que só afete um streamer. Editar a variável ainda exige
reiniciar o serviço pra valer (não é hot-reload). `public/board.html` +
`public/js/app.js` + `public/js/settings.js` continuam no repo intactos de
propósito, não foram apagados -- são o fallback, decisão consciente de não
fazer essa limpeza ainda (ver auditoria de paridade abaixo antes de
considerar apagar).

Antes de virar padrão pra todo mundo, foi feita uma auditoria completa de
paridade vanilla → React (2026-09-02): nenhuma feature do vanilla se perde
ao aposentá-lo. 12 dos 13 modais do vanilla já tinham par React
(`SettingsModal`, `RankingModal`, `RecapModal`, `RaceModal`, `LotModal`,
`ModCodeModal`, `PresenterLoginModal`, `ExtratoModal`, `HistoryOverlay`,
`SoldOverlay`, `TopbarMenu`, `LotContextMenu`); o único que ficou de fora
foi o `donate-modal` (gerar QR Pix direto, Efí), **decidido não portar**:
além de já estar com o botão de entrada oculto de propósito (doação hoje é
só via link `/l/:id/doar`, nunca embutida no board), ele reflete um fluxo
de pagamento (QR Efí + confirmação por socket) que `doar.js` já não usa
mais (ponte pixgg.com fez esse branch virar código morto, ver seção de
pagamento acima) -- portar agora seria recriar uma arquitetura obsoleta que
precisará ser refeita quando a Efí for aprovada de verdade. O React ganhou
3 coisas que o vanilla nunca teve (aditivo, não regressão): config de meta
**global** da corrida (`RaceConfigModal.jsx`, vanilla só tinha meta manual
por lote), "adicionar manualmente" clicando fora de qualquer card no
catálogo vazio, e o glow/contador de `!hype` do chat (`.lot-likes`/
`.is-firing`) -- esse último já existia no backend (`src/twitchChatBot.js`)
rodando pra QUALQUER leilão, só nunca tinha sido desenhado no vanilla, então
streamers que só conheciam o board antigo veem esse efeito pela primeira
vez depois da virada.

**Pendências conhecidas, deliberadamente fora dessa virada**: a sidebar do
board standalone (`/l/:id`, `SystemSwitch.jsx`, 6 ícones: voltar, ranking,
alternar Leilão/Reacts, config, histórico) e a do board embutido no hub
(`/painel/leilao`, sidebar do próprio hub, 4 ícones: início/perfil/config/
histórico) continuam visualmente diferentes -- reaproveitam o mesmo
componente `NavRail` mas com conjuntos de itens distintos, nunca foram
reconciliadas. Decisão consciente de deixar pra depois (pedido do cliente),
não é bug. Apagar de vez `board.html`/`app.js`/`settings.js` do repo também
ficou de fora -- só depois de um tempo confirmando que ninguém precisou do
fallback.

Grid 3 colunas: host+doadores (esquerda), catálogo de lotes (`.lot-card`,
centro), timer+histórico (direita). `.presenter-bar` só aparece em modo
apresentador.

**Acesso ao modo apresentador**: dono via sessão Twitch OAuth global (cookie
compartilhado entre leilões, `twitchSession.twitchUserId === meta.ownerTwitchUserId`)
— sem senha. Convidado/moderador via **código de uso único** (8 caracteres,
sem `0/O/1/I/L`) gerado pelo dono, consumido no primeiro login.

Doação chegando em tempo real dispara em cascata: reposicionamento de card,
flash de cor, tick de valor, badge de streak (combo dentro de 60s), glow de
duelo (dois classificados com placar próximo), confete se > R$100, e no
fechamento do leilão o "Vencedor!" (swirl canvas) seguido do recap
automático ~2.4s depois.

**Chat da Twitch (`!hype "nome do jogo"`, `src/twitchChatBot.js`)**: bot
compartilhado (uma conta só, todos os leilões), conectado anônimo via
`tmi.js` (sem OAuth, só lê chat público -- não precisa de autorização por
streamer). Entra no canal de cada leilão que já tem `hostTwitchLogin`
salvo (`store.getState`, setado na criação, não é o mesmo que o meta do
`registry.js`) assim que o server sobe, e no canal de um leilão novo na
hora que ele é criado (`registerChannel`, chamado de dentro de `POST
/api/leiloes`). Cada `!hype "jogo"` reconhecido (mesmo `findExistingGameInText`
usado pra doação livre, só casa jogo que já existe no catálogo, nunca cria
um novo) soma 1 em `likes` nesse jogo (`store.likeGame`, campo simples que
zera sozinho no `resetAll` igual `comboCount`) -- limitado a 1 hype aceito
por espectador a cada 10 minutos (`Map` em memória, por `viewerId` da
Twitch, não por conta nossa). A cada múltiplo de 10 likes, o servidor
manda um `lastEvent` (`type: "hype", fire: true`) só pra esse gatilho
pontual -- o contador em si vem sempre no `leaderboard.items[].likes`
(persistente, igual `combo`), não no evento. No board, `ArenaPanel.jsx`
segue o mesmo idioma do `flash`/confete (`useEffect` em `[lastEvent]`,
`setTimeout` de 5s) pra acender `.lot-card.is-firing` (glow laranja
pulsante + `.lot-firing-flame`); o coração+contagem (`.lot-likes`) é
sempre visível quando `likes > 0`, sem depender de evento nenhum.

**Mesclar lotes por drag and drop**: arrastar um `.lot-card` sobre outro
(mouse/desktop só, checado por `document.body.classList.contains
("presenter-mode")`) mescla os dois via `confirmDialog` + a mesma rota
`POST /admin/merge` que já existia pro fluxo manual — listeners de drag
(`wireLotCardDrag` em `app.js`) são presos no card só na criação (elementos
são reaproveitados entre re-renders via `data-key`, só o `innerHTML` muda),
nunca a cada atualização do leaderboard. Botão direito num `.lot-card`
também ganhou **"Excluir jogo"** (`DELETE /admin/game/:key`, já existia pro
fluxo da tabela de Configurações → Jogos/Filmes, só faltava no menu de
contexto do board).

**Mesclar apoiador por drag and drop (2026-08-21)**: mesmo gesto acima,
aplicado ao `.donor-row`/`.donor-leader` do `DonorsPanel` -- corrige
apoiador que digitou o próprio nome diferente em doações separadas. Doador
não tem registro próprio (diferente de jogo): total/rank em `getTopDonors`
são sempre calculados na hora agrupando `data.events[].username`, então
"mesclar" é só `renameDonor` (`src/db.js`) reescrevendo esse campo em todos
os eventos que batem com o nome errado, via `POST /admin/merge-donor`.
Diferente do `.lot-card` (reaproveitado via `data-key`), `donorListEl` é
reconstruído inteiro a cada `renderDonors()` no vanilla -- os listeners de
drag ficam no container estável (delegação via `data-donor-username`), não
em cada linha. "Anônimo" (username vazio) não é arrastável, não faz sentido
mesclar identidades que nunca foram uma pessoa só.

**Placeholder de capa desconhecida vira o logo da Twitch (2026-08-21)**:
`.lot-thumb-placeholder` mostrava a inicial do nome; trocado pelo mesmo
glifo da Twitch usado em `.host-twitch-badge` (`TwitchIcon` em
`icons.jsx`/`TWITCH_ICON_SVG` em `app.js`) -- cobre tanto jogo real sem
capa encontrada quanto "quadro" da live que não é jogo/filme de verdade
(nunca vai ter capa nenhuma pra achar).

**Card com corrida+duelo ficava alto demais, esticando a capa e o vizinho da
mesma linha (corrigido 2026-09-01, 4 tentativas até achar a divisão certa)**:
bug real visto num card em disputa de última vaga E com meta de
corrida batida ao mesmo tempo (barra de corrida + repasse + top doador
empilhados embaixo do nome/valor, bem mais alto que o normal).
1ª tentativa: dar altura fixa pra `.lot-card-bg` (a capa desfocada de fundo,
que usava `inset: -10px` esticando pra cobrir a altura inteira do card via
`background-size: cover` -- card mais alto forçava um zoom pesado na
imagem). Não resolveu de verdade: só trocou "imagem esticada" por "espaço
vazio de cor sólida", porque a causa raiz era outra.
2ª tentativa: `.arena-grid` é CSS Grid sem `align-items` definido (default
`stretch`) -- todo card da mesma linha da grade estica até a altura do mais
alto dela, então o vizinho (conteúdo curto) esticava só pra combinar com o
card alto do lado. `align-items: start` resolvia esse sintoma, mas o
cliente não gostou do resultado (cards da mesma linha com alturas bem
diferentes -- pediu pra não esticar o card, e sim colocar a info que não
coubesse do lado, não embaixo).
3ª tentativa: valor + repasse + top doador + barra de corrida TODOS saíram
de `.lot-info` pra uma coluna irmã nova, `.lot-extras`, ao lado da capa.
Card não crescia mais, mas o cliente achou o resultado esquisito -- nome
ficava truncado demais (a coluna de valor/corrida/doador competindo por
espaço com o nome, num card já compacto de 2 colunas) e valor/doador
saindo do nome em TODO card (não só quando tinha corrida) fugia do padrão
visual de sempre.
Fix definitivo: só quando o lote **tem corrida ativa** que a divisão
acontece -- a barra de corrida ocupa o lugar de sempre (embaixo do nome,
dentro de `.lot-info`, no lugar onde o valor ficaria), e é o **valor** (+
repasse + top doador) que vai pra `.lot-extras` ao lado da capa nesse caso
específico. Sem corrida ativa, nada muda: nome, valor, repasse e top doador
empilhados exatamente como sempre foram (`.lot-total` embaixo do nome,
pedido explícito antigo). Como corrida+valor+doador (o que quer que esteja
empilhado em `.lot-info` a cada momento) sempre cabe dentro da altura da
capa (112px comum, 178px rank 1), o card nunca precisa crescer por causa
disso. `align-items: start` no Grid continua valendo como redundância.

A altura fixa da `.lot-card-bg` (1ª tentativa) **voltou atrás** depois disso:
um número fixo (168px/230px) não acompanha nome que quebra linha (rank 1,
`white-space: normal`) nem repasse+top doador um pouco mais alto que a
média -- sobrava um pedaço de fundo sólido visível embaixo da capa nesses
casos (bug novo visto no rank 1 com nome longo, "Gretchen Filme Estrada").
Como a causa raiz de verdade (corrida empilhando junto com repasse/top
doador) já foi resolvida direto no conteúdo, `.lot-card-bg` não precisa
mais se proteger do caso extremo que não existe mais -- voltou a ser
`inset: -10px` (acompanha a altura real do card) como era originalmente.

**Card do rank 1 "vazando" visualmente por baixo dos vizinhos (2026-09-01,
2 tentativas, cliente pediu explicitamente pra manter o destaque do rank 1
e só corrigir o bug -- reverter o visual não é opção)**: cliente reportou
(com print circulado) o rank 1 aparentando não "terminar" -- um pedaço da
borda/fundo continuava visível sobrepondo o topo dos cards 2/3 da linha
seguinte, reproduzido ao vivo no Chrome/Edge no Windows, piora ao
redimensionar a janela (não melhora, o que descarta "só precisa de um
repaint" como explicação completa). Reproduzi a estrutura exata
(`.arena-grid` com rank 1 full-width + 2 cards na linha de baixo, mesmo
CSS) num Chromium headless local via Playwright pra medir as posições
reais (`getBoundingClientRect`) -- sem overlap nenhum, grid calculado
certinho, confirmando que não é erro de cálculo de layout (o card em si
não é maior que deveria).

1ª tentativa: hipótese de bug de repaint do Chromium (comum com
`filter: blur()` dentro de Grid que reordena com frequência via Socket.IO)
-- o navegador "esqueceria" de repintar a região de um card quando ele
muda de posição, deixando o `.lot-card-bg` borrado de um card antigo vazar
visualmente. Mitigação: `transform: translateZ(0)` (força compositing
layer próprio) + `contain: layout style`. **Confirmado pelo cliente que
NÃO resolveu** ("continua a mesma coisa") -- descartada.

2ª tentativa: troca de teoria pra forçar o clip no compositor
(`clip-path: inset(0 round var(--radius))` em `.lot-card` no lugar de
`transform`/`contain`) -- **também não era a causa raiz**, só um chute em
cima do sintoma errado (ficou no CSS de qualquer forma, é reforço
inofensivo, mas não foi isso que resolveu).

**Causa raiz de verdade (achada ao vivo, com o cliente reproduzindo o bug
na hora testando o Modo Corrida)**: não é bug de renderização/CSS nenhum
-- é lógica quebrada em `computeRaceRanks` (`server.js`), a função nova do
Modo Corrida (trava de posição) escrita no mesmo dia. Quando um lote bate a
meta, ele trava (`race_locked_rank`) no próprio rank "natural" (por
dinheiro) do momento -- só que esse rank natural é recalculado do zero a
cada chamada, sem saber que aquele número JÁ está preso por outro lote de
uma trava anterior. Se o dinheiro mover um lote pra cima até ocupar a
posição natural de quem já travou, e esse lote TAMBÉM bater a própria meta
nesse instante, ele travava em cima do número já ocupado -- dois lotes
com `rank: 1` ao mesmo tempo. Como o CSS gigante do rank-1
(`.lot-card.rank-1`, min-height 210px, capa 178px, fonte 28-36px) é
aplicado por CLASSE, não por posição no DOM, e só o `:first-child` de
verdade ganha `grid-column: 1/-1`, o segundo lote com `rank-1` ficava com
a capa/fonte gigante espremida numa célula de grid normal (meia largura)
-- exatamente o "esticado"/"vazando"/"cortado" que várias screenshots ao
longo do dia relataram, sempre em formas ligeiramente diferentes. Fix:
`computeRaceRanks` agora mantém um `Set` de ranks já travados construído
ANTES de travar qualquer lote novo, e ao travar um lote empurra pro
próximo número livre acima do natural se o natural já estiver ocupado --
nunca mais deixa dois lotes travarem no mesmo número. O mesmo loop também
AUTO-CURA qualquer trava duplicada que já estivesse salva em disco de
antes desse fix (`rows` vem ordenado por dinheiro; entre dois lotes com o
mesmo número travado, o mais forte por dinheiro mantém a trava, o outro
destrava e volta a competir pela fila normal) -- não precisa de migração
manual nem de desativar/reativar a corrida em nenhum leilão já afetado,
resolve sozinho na próxima vez que o leaderboard for montado.

**"Classificado" aparecendo pra lote sem vaga de corrida sobrando
(2026-09-01, corrigido, PR #10)**: bug irmão do anterior, achado na mesma
sessão de teste ao vivo. Streamer configurou a meta GERAL do leilão
(mini-menu → Modo corrida) com 3 vagas bônus, foi adicionando jogos, e
TODOS os que cruzavam o valor apareciam como "classificado" -- não só os
3 primeiros. Causa: `qualifiedByRace`/`winning` (`server.js`,
`serializeLeaderboard`) eram calculados só checando `raceGoalReached`
(o valor bateu a meta), sem checar se o lote de fato conseguiu a vaga
(`race_locked_rank != null`) -- uma vez que o teto de vagas já tinha sido
usado por outros lotes, um lote novo que cruzasse o mesmo valor continuava
marcado como classificado mesmo sem ter garantido nada. Fix: os dois
campos agora só contam quem realmente tem a trava ou já está
naturalmente entre os classificados por dinheiro puro; quem bate o valor
sem vaga sobrando mostra "meta batida, mas sem vaga sobrando" em vez de
"classificado!" (`LotCard.jsx` e `app.js`, mesma condição nos dois).

**Confusão de uso ainda não resolvida (não é bug de código)**: o cliente
queria que só um punhado de jogos escolhidos a dedo entrasse na corrida,
mas configurou pela meta GERAL do leilão -- que por design vale pra
QUALQUER lote sem meta manual própria, não pra uma lista escolhida. Pra
"só alguns jogos específicos com meta", o caminho certo já existe: meta
manual por lote (botão direito no card, nunca vaza pros outros). Orientei
o cliente nesse sentido ao vivo, mas não confirmei se ele já mudou o uso
-- se a reclamação voltar mesmo com meta manual (não geral), aí sim
investigar de novo. Nenhuma mudança de código pendente nesse ponto.

**Modo corrida: semântica pretendida pelo cliente é DIFERENTE da atual
(2026-09-04, confirmado ao vivo testando `ec333f9059e5`, AINDA NÃO
IMPLEMENTADO -- só documentado por pedido explícito, "documente essa
lógica pra não esquecer")**. Cenário de teste que expôs a diferença:
`qualifyCount=3`, corrida com meta R$300 e `raceMaxWinners=3`. Dinheiro:
Uncharted4=1000, GTA V=500, Last of Us=500, LoL=500, GTA4=400 -- os 3
primeiros a bater R$300 (na ordem) foram GTA V, Last of Us e LoL.

O que o cliente espera (a regra de verdade do modo corrida): as
`raceMaxWinners` vagas da corrida são um **grupo totalmente separado** da
disputa por dinheiro. Os primeiros N a bater a meta ficam classificados
e imunes à sabotagem, PONTO -- saem inteiramente do cálculo de quem
disputa as `qualifyCount` vagas normais. Só quem NÃO bateu a meta
primeiro compete entre si pelas vagas normais, por dinheiro, podendo ser
ultrapassado/desclassificado. Total esperado: até `qualifyCount +
raceMaxWinners` classificados, dois grupos que nunca se misturam (no
cenário de teste, isso daria os 3 da corrida + até 3 dentre {Uncharted4,
GTA4, ...} por dinheiro puro -- GTA4 com R$400 deveria entrar).

O que o código faz hoje (`computeRaceRanks`, `server.js:397`): trava e
disputa vivem no MESMO ranking, não em grupos separados. Um lote que
trava a corrida MAS já seria naturalmente top-`qualifyCount` por
dinheiro (era o caso do GTA V e do Last of Us, rank natural 2º/3º) não
abre vaga nova nenhuma -- a trava dele só "coincide" com uma vaga que
ele já ia ter de qualquer jeito. No teste, isso fez sobrar só 1 vaga de
corrida "de verdade" (a do LoL, que sem a corrida ficaria de fora), e
quando o GTA4 bateu a meta depois, o teto de 3 já tinha sido consumido
por travas redundantes -- ele ficou de fora tanto da corrida (sem vaga)
quanto do natural (rank 5º > qualifyCount 3º).

Essa diferença é justamente o motivo da trava não isentar vencedor
natural hoje (ver "Bug real visto em produção" logo acima, PR #10,
2026-09-01) -- aquele fix evitou que o teto de vagas fosse ultrapassado
isentando quem já ganhava por dinheiro, mas como efeito colateral abriu
esse outro problema: o teto pode ser "gasto" em quem não precisava dele.
**Não dá pra resolver os dois ao mesmo tempo sem separar os grupos de
verdade** -- pra implementar a semântica que o cliente quer, precisa
que `computeRaceRanks` primeiro decida quem trava a corrida (os N
primeiros por `race_goal_reached_at`, cheio o teto e pronto, IGNORANDO
se esses lotes já seriam natural winners) e DEPOIS calcule o top-
`qualifyCount` natural só entre quem sobrou (excluindo os já travados
do cálculo de rank natural inteiro, não só do resultado final) --
mudança real na função, não um ajuste pequeno. Pendente, sem código
escrito ainda.

**Card do rank 1 sobrepondo a linha seguinte, causa raiz DIFERENTE das
tentativas acima (2026-09-01, corrigido)**: bug irmão dos dois anteriores
só na aparência (card 1 "maior", cobrindo os cards de baixo), causa raiz
nova. Reproduzido ao vivo em produção (`ec333f9059e5`, board React) com 6-7
lotes e meta de corrida ativa: o rank 1 renderiza 236px de altura (card
normal é 148-154px, rank 1 tem `min-height: 210px` fixo + a barra de meta
da corrida empurra mais) mas a LINHA do CSS Grid que contém ele era
calculada com só 210px -- confirmado ao vivo injetando JS na página de
produção e lendo `getComputedStyle(.arena-grid).gridTemplateRows` (linha 1
saía "210px", não "236px"). Causa: `.arena-grid` nunca definia
`grid-auto-rows`, caindo no `auto` padrão do navegador -- que, testado ao
vivo trocando por `min-content`/`max-content` na própria página (revertido
depois), corrige a conta pra bater com a altura real do conteúdo. Sem essa
propriedade, o Chrome dimensiona a linha implícita pelo `min-height` do
item (210px) em vez da altura de fato renderizada quando o conteúdo cresce
além dele -- o card ultrapassa a própria linha por baixo, sobrepondo a
linha seguinte por alguns pixels (confirmado: card 1 terminava em y=499,
card 2 começava em y=491, 8px de sobreposição real, não só visual/
percepção). Fix: `grid-auto-rows: min-content` em `.arena-grid`
(`style.css`). Diferente dos bugs de rank-1 documentados acima (que eram
lógica de `computeRaceRanks` duplicando trava), esse é puramente CSS de
layout -- não mexe em `computeRaceRanks` nem em nada de servidor.

**Estado ao fim da sessão de 2026-09-01 (corrida)**: os 3 PRs acima (#8
clip-path -- não era a causa raiz mas ficou, inofensivo; #9 travas
duplicadas; #10 teto de vagas) foram todos mergeados em `master` e
confirmados com deploy SUCCESS no Railway. Nenhum foi reconfirmado ao
vivo pelo cliente depois do deploy (a sessão foi encerrada logo em
seguida) -- primeira coisa a checar numa sessão futura se o Modo Corrida
voltar a ser mencionado: pedir print atual do leilão de teste
(`ec333f9059e5`/nicolebaz) antes de assumir que ainda há bug.

**Adicionar jogo/filme manualmente pelo catálogo (2026-08-30)**: botão
direito no `.arena-grid` **fora** de qualquer `.lot-card` (inclusive com o
catálogo vazio) abre "Adicionar {jogo/filme} manualmente" (`LotContextMenu.jsx`,
`target.type === "add-manual"`) -- pede o nome via `promptDialog` e abre o
mesmo `LotModal` já usado pela busca da presenter-bar (`{name, image: null}`),
que lança via `POST /admin/manual-entry` normalmente (capa é resolvida do
lado do servidor, igual doação de chat/pixgg.com). Só existe na versão React
por enquanto -- o botão direito do vanilla (`app.js`) continua só com corrida/excluir.

**Toggle Jogos↔Filmes saiu de dentro do drawer do apresentador (2026-08-30)**:
antes só aparecia depois de clicar no FAB de lápis (`.presenter-fab`, abre
"ferramentas do apresentador" -- busca, lançar lote, zerar, histórico).
Trocar de modalidade zera catálogo e histórico do round, então não devia
ficar no meio dessas ferramentas menores nem exigir 2 cliques -- `.mode-toggle`
virou elemento irmão do FAB, sempre visível em modo apresentador
(`position: fixed`, mesmo `z-index`, encostado à esquerda do FAB), tanto no
board vanilla (`board.html`/`app.js`) quanto no React (`PresenterBar.jsx`).

**Lápis virou mini-menu, modo corrida ganhou meta global + trava de posição
(2026-09-01)**: pedido explícito do cliente depois de explicar a intenção de
verdade do modo corrida -- não é só "vaga extra de classificado", é "esse
jogo/filme já está garantido, o streamer vai jogar/assistir ele nem que
outro passe na frente em dinheiro depois". Três mudanças juntas:

1. **Trava de posição de verdade** (`computeRaceRanks` em `server.js`): antes,
   bater a meta só somava +1 vaga de classificado (`qualifiedByRace`), mas o
   NÚMERO do rank continuava 100% por dinheiro -- um lote podia subir/descer
   de posição mesmo já "classificado por corrida". Agora, no momento em que
   o total cruza a meta, o rank naquele instante é congelado
   (`race_locked_rank`, persistido por jogo) e nunca mais muda enquanto o
   total continuar >= a própria meta -- os outros lotes se reorganizam ao
   redor dele, pulando o número reservado. Se sabotagem derrubar o total
   abaixo da meta, destrava (volta pra fila normal por dinheiro); se bater
   nível de novo depois, ganha uma trava NOVA (pode ser outra posição).
   `naturallyWinning` (base do `qualifiedByRace`) continua calculado por
   dinheiro puro (`naturalRankByKey`, sem nenhuma trava no meio) -- só o
   `rank` exibido é que incorpora as travas, pra não confundir "quem tá
   forte por dinheiro" com "que número aparece no card".
2. **Meta global do leilão** (`raceGlobalGoalCents`/`raceGlobalMaxWinners`, `store.setState`,
   rotas `POST`/`DELETE /admin/race-config`): antes só dava pra configurar
   meta lote por lote (botão direito no card, `RaceModal.jsx`). Agora o
   streamer também pode definir UM valor + quantas vagas bônus ele concede,
   valendo pra qualquer lote que não tenha meta MANUAL própria (meta manual
   sempre tem prioridade sobre a global pro mesmo lote, pra poder customizar
   um caso sem mexer na config geral). O teto de vagas só vale pra quem
   qualifica pela meta global -- meta manual por lote nunca teve limite de
   quantos podem bater, e continua sem limite.
3. **Lápis virou mini-menu** (`PresenterBar.jsx`): o FAB de ferramentas
   (`.presenter-fab`) antes abria direto o popover com busca+adicionar
   lote+zerar+histórico. Agora abre um mini-menu vertical simples
   (`.presenter-mini-menu`, ícone+label empilhados em cima do FAB) com 4
   itens: Adicionar lote (abre o mesmo popover de busca de sempre),
   **Modo corrida** (novo, abre `RaceConfigModal.jsx` -- modal simples só
   com valor + vagas bônus), Histórico, Zerar leilão. Só existe na versão
   React por enquanto -- o vanilla (`app.js`/`board.html`) continua com o
   popover antigo sem o item de corrida (meta global só dá pra configurar
   pelo board React até isso ser portado).

**Vagas classificadas ganhou atalho no mini-menu (2026-09-04)**: o
`qualifyCount` (quantos lotes contam como classificados por dinheiro,
1-10) só dava pra mudar lá no fundo de Configurações → Geral -- pedido
explícito do cliente pra facilitar acesso durante a live, já que ele
mexe nisso junto com o modo corrida na hora de testar. Novo item
**Vagas classificadas** no mini-menu (5º item, entre Modo corrida e
Histórico) abre `QualifyCountModal.jsx`, mesmo slider (`.qualify-slider`,
CSS já existente em `settings.css`, carregado no board via
`client/index.html`) e mesmo endpoint (`POST /admin/qualify-count`) que
`GeneralTab.jsx` já usava -- não duplica lógica nova, só dá um caminho
mais curto até o mesmo dado.

**Recap (React, 2026-09-03/04)**: quando o leilão fecha, `WinnerReveal.jsx`
(corredor 3D → pódio triangular, capas de verdade dos jogos convergindo pro
centro, confete no campeão) toca fullscreen e, ao terminar, vira o próprio
`RecapModal.jsx` num único painel persistente (nunca some sozinho, só fecha
por clique no ✕ ou no fundo) -- não é mais "animação rápida seguida de um
modal diferente por cima", é a MESMA linguagem visual virando o resultado
final. A transição é um crossfade (o overlay fullscreen encolhe/some
exatamente quando o `RecapModal` aparece por baixo, `revealing`/`is-settled`
em `style.css`, `max-width`/`max-height` animados), não uma migração
literal do mesmo nó DOM entre os dois sistemas de layout (perspectiva 3D
fullscreen vs painel normal) -- decisão consciente pra evitar a fragilidade
de tentar morphar os dois.

**Segunda iteração (mesmo dia, feedback do cliente ao vivo)**: tentativa
inicial trocou o "pódio assentado" (3 cards tipo pôster) por uma lista de
até 10 cards estilo catálogo DENTRO do próprio `.recap-modal` -- **errado**,
corrigido na hora (cliente: "ERA PRA DEIXAR O QUADRADO DO RECAP EXATAMENTE
COMO ESTAVA... OS CARDS DO LADO DIREITO"). O pedido de verdade era um
**painel novo e separado ao lado** do quadrado de sempre, não substituir o
conteúdo de dentro dele. `.recap-modal` (pódio de 3 + stats + "também
classificados" + apoiadores) voltou a ser exatamente como era antes dessa
sessão de feedback -- só ganhou um vizinho, `.recap-catalog-panel`
(`style.css`), com a lista de até 10 cards idênticos ao do catálogo ao
vivo (`RecapLotCard.jsx`, reaproveita as classes CSS de `.lot-card`/
`LotCard.jsx` sem o componente inteiro -- sem `draggable`/handlers de
drag/context-menu/`.lot-edit`/streak/duel/firing/barra de progresso ao
vivo, essas só fazem sentido num leilão rodando). `.recap-lot-list`
dentro desse painel é uma lista vertical simples, sem tentar replicar o
grid auto-fill/rank-1 full-width da arena ao vivo. Um `.qualify-divider`
(mesma classe que a arena ao vivo já usa) separa quem tá classificado de
verdade (`winning:true`) do resto, mostrado só pra dar contexto do round
-- a posição do divisor usa a MESMA lógica de `qualifyBoundaryKey` que
`ArenaPanel.jsx:108-122` já tinha (último item `winning`, não um corte
fixo em `rank <= qualifyCount`, porque um lote travado pela corrida pode
ocupar um rank fora do corte natural). `.recap-overlay` (`.page
.recap-overlay` em `style.css`) virou flex-row com `gap`, alinhado à
esquerda (não mais centralizado) pra abrir espaço pro painel novo do
lado direito -- `.recap-catalog-panel` some inteiro abaixo de 1100px de
viewport (não cabe os dois lado a lado, e o quadrado principal sozinho
continua funcionando normalmente). Vanilla (`board.html`/`app.js`)
reaproveita a mesma classe `.recap-overlay` pro próprio recap mais
simples (sem painel de catálogo nenhum) e continua centralizado,
propositalmente intocado.

Histórico (`recap.showHistorical`, via modal ou aba Avançado das
Configurações) usa o **mesmo** `RecapModal`, só que sem o `WinnerReveal` --
monta direto no estado assentado (`revealing=false`), sem o corredor de
entrada (não tem "revelação" pra fazer de um round que já passou).

`buildRecap()` (`server.js`) ganhou campos novos: `raceActive` (round
teve modo corrida configurado, meta global ou manual), e por jogo em
`topGames`: `qualifiedByRace` (a vaga veio da trava de corrida, não de
estar naturalmente entre os mais arrecadadores), `winning` (classificado
de verdade, natural OU travado -- mesma semântica de
`serializeLeaderboard`/`computeRaceRanks`) e `raceOrder` (posição na fila
de quem bateu a meta da corrida PRIMEIRO, `race_goal_reached_at`
ascendente, só entre quem é `qualifiedByRace` -- pedido explícito do
cliente: "colocar em ordem de qual jogo vai ser jogado primeiro"). O
recap também passou a montar `topGames` por `finalRank` (com as travas
aplicadas) em vez de só dinheiro puro -- bug de quebra que existia desde
sempre: um jogo que travou vaga por corrida mas caiu de posição em
dinheiro depois podia ficar de fora do top do recap. `topGames` mostra
até **10** jogos sempre, independente do `qualifyCount` configurado pro
round (é sobre dar mais contexto do round inteiro, não só sobre quem
"venceu" -- `winning`/o divisor continuam controlando quem é
classificado de verdade dentro desses até-10). `RecapLotCard` mostra o
mesmo selo `.badge-race-qualified` que a arena ao vivo já tem
(`LotCard.jsx`), com o texto trocado pra incluir a posição da fila
("1º a jogar") quando `raceOrder` existir. Rounds arquivados antes dessa
mudança não têm esses campos, então nunca mostram o selo (mesmo padrão
de "não migra retroativamente" já usado pra tema/gênero).

Download de imagem (canvas 2D) e compartilhar no X continuam exatamente
como eram (`buildRecapCanvas`/`downloadCanvasAsPng` em `client/src/lib/
effects.js`) -- decisão consciente de não recriar o efeito 3D no canvas de
download, só a experiência ao vivo na tela ganhou o visual novo.

O vanilla (`board.html`/`app.js`, fallback) **não foi tocado** -- continua
com o swirl genérico antigo + `RecapModal` separado de sempre. As classes
CSS antigas do pódio plano (`.recap-podium-card`/`-thumb`/`-donors`/
`-top-donor`) continuam no `style.css` por causa disso (e porque
`RankingModal.jsx`, ranking de leilões do streamer, não de jogos de um
round, também reaproveita `.recap-podium`/`-card`/`-rank`/`-name`/`-total`
-- só não tem capa/doador, não usa as variantes de thumb).

**Configurações** continua sendo modal (`.settings-overlay`/`.settings-modal`
em `board.html`, lógica em `settings.js`), não página própria — decisão
deliberada, ver seção de componentes reutilizáveis acima. Por dentro, a
antiga barra de abas horizontal com pílula deslizante virou uma **sidebar
vertical de ícones** (`.settings-nav`/`.settings-nav-item`, mesmo visual do
`.perfil-nav-item` do Perfil, mas implementação própria), pra dar uma
identidade mais de "painel" e menos de "mais um modal igual aos outros".
4 seções na sidebar (`data-tab`/`data-tab-panel`): Geral (título, links de
doação/alerta, abrir/encerrar, qualifyCount), Aparência (tema, imagem de
fundo), Jogos/Filmes (lançamento manual, tabela com editar/excluir/mesclar
duplicados), Avançado (histórico de leilões, revogar acesso de moderadores,
zerar leilão). Chave Pix, saldo, saque e "sair da conta" **não** ficam aqui,
ver Perfil abaixo.

Toggle de modalidade Jogos↔Filmes fica na `presenter-bar` (não dentro de
Configurações) e troca todos os textos da UI via sistema de labels dinâmicos
(`data-label-text`/`data-label-placeholder`/`data-label-title`).

Um ícone no canto do `host-panel` (`#host-perfil-link`) leva pro Perfil,
visível só pro dono em modo apresentador (não pra público nem moderador).

### Perfil (`/painel/perfil`, React -- página standalone antiga aposentada em 2026-08-21)

Tela de conta, fora do escopo de um leilão específico -- `streamerId` é por
conta (`streamersStore.ensureByTwitchUserId`), então chave Pix, saldo,
saque, histórico de saques e som do alerta são os mesmos não importa qual
leilão o streamer está gerenciando (nunca precisa configurar de novo por
leilão). Layout em sidebar com 5 seções: **Visão geral** (estatísticas de
doação + gráfico dos últimos 30 dias, SVG feito à mão), **Financeiro**
(saldo, chave Pix, saque, histórico), **Widget OBS** (link do overlay),
**Alerta** (som da doação) e **Doações** (histórico + bloqueio de doador,
ver abaixo). Rotas de conta em `server.js`: `GET /api/perfil`,
`POST /api/perfil/pix-key`, `POST /api/perfil/saque`,
`GET /api/perfil/saques`, `POST /api/perfil/alert-chime` (gate é só
`getTwitchSession(req)`, sem `leilaoId`). Também mostra o total histórico já
arrecadado (`ledgerStore.getLifetimeEarnedCents`, nunca cai mesmo depois de
sacado) e "sair da conta".

**Perfil vivia em duas versões (vanilla `public/perfil.html`/`perfil.js` +
React `/painel/perfil`) até 2026-08-21**, quando a vanilla foi aposentada:
uma vez que as 5 abas do React ficaram completas (ver histórico abaixo,
terminado com Financeiro em 2026-08-20), a standalone virou pura
duplicação (2ª implementação de `confirmDialog`, 2ª implementação da
sidebar `.perfil-nav`) sem ganhar nada em troca. `GET /perfil`
(`server.js`) agora é só um `301` pra `/painel/perfil` -- mesmo padrão já
usado em `/meus-leiloes` → `/painel`. `public/perfil.html`/`perfil.js`
foram removidos; `public/css/perfil.css` **continua existindo** (o hub
carrega ele direto em `painel.html`, `PerfilStandalone.jsx` reaproveita as
classes quase sem alteração).

A versão React (`client/perfil.html` + `perfil-main.jsx` +
`PerfilStandalone.jsx`, 4º *entry* standalone do Vite, mesmo padrão de
fetch-and-inject de Configurações/Histórico -- ver `#view-perfil`/`#perfil-root`
em `painel.html`) é agora **a única**. Reaproveita as classes de
`perfil.css` quase sem alteração (`.perfil-shell`/`.perfil-sidebar`/`.perfil-nav`/
`.perfil-stat-card`/etc já eram bem desenhadas, não precisou reinventar
visual), exceto que **não** usa o hack de `.perfil-main` de escapar pro
`100vw` (isso só fazia sentido na página standalone antiga, que era o
`body` inteiro -- no hub o conteúdo já flui dentro de `.hub-main`). Botão
"Sair da conta" usa `confirmDialog` de verdade (`useDialogs.jsx`), não
`confirm()` nativo, diferente do avatar da sidebar do hub (ver seção Hub
acima, que É uma exceção deliberada).

**Widget OBS (2026-08-17)** foi a primeira das 4 abas placeholder a ganhar
conteúdo de verdade (`WidgetObsTab.jsx`) -- port direto do que já existia
em `perfil.js` (link + `CopyButton.jsx`, o mesmo componente React que o
board já usa pros links de doação/alerta, não um novo), sem rota nova.
Mesma condição de sempre: sem `latestLeilao`, mostra aviso pra criar um
leilão primeiro; com mais de um leilão, aponta pro `/painel` em vez do
antigo `/meus-leiloes`.

**Alerta (2026-08-17)** também ganhou conteúdo de verdade
(`AlertaTab.jsx`) -- port completo, não simplificado: 4 presets
sintetizados via Web Audio (mesmo mapa de frequências duplicado de
`perfil.js`, comentário explica por quê), upload de áudio próprio com
sonda de duração no cliente (`new Audio(URL.createObjectURL(file))`,
recusa antes de subir se passar de 10s) e confirmação no servidor,
`perfilFetch()` novo em `client/src/lib/api.js` (mesmo padrão de
`presenterFetch`, só que pra `/api/perfil/*` em vez de `/api/l/:id/*`,
reutilizável pelas próximas abas). Testado contra o servidor de
verdade sem estar logado -- o botão Salvar bateu em `/api/perfil/alert-chime`,
levou 401 "Faça login com a Twitch" de propósito, e o feedback de erro
apareceu certinho -- prova que o caminho de erro funciona ponta a ponta;
o caminho de sucesso só troca o status da resposta.

**Doações (2026-08-17)** foi portada de propósito com o mesmo bloqueio
"Em breve" que a página standalone já tem, **não é feature nova
desativada por engano**: enquanto a ponte via pixgg.com for o caminho
ativo de doação, o webhook dela só atualiza o placar do leilão, nunca
grava linha em `payments` no Postgres (é de lá que `donorIp` viria pra
bloquear alguém) -- então histórico e bloqueio nunca refletem doação
recente de verdade nesse meio tempo (ver commit `fd4d45a`). `DoacoesTab.jsx`
implementa a lógica real (busca com debounce, listar/bloquear/desbloquear,
`GET/POST /api/perfil/donations`, `/blocked-donors`) mas embrulha tudo em
`.perfil-disabled-wrap` (`pointer-events: none` + selo "Em breve"),
pronta pra "ligar" só tirando o wrapper quando a Efí for aprovada e
`payments` voltar a ser alimentado por doação de verdade -- mesmo padrão
da página standalone, não reinventado.

**Financeiro (2026-08-20)** foi a última das 5 abas, deixada por último de
propósito por ser a mais sensível a dinheiro (ver "Regra permanente" no
topo deste arquivo). `FinanceiroTab.jsx` reproduz exatamente a mesma
divisão de responsabilidade que a página standalone já tem, não inventa
nada novo: o card "doação via pixgg.com" fica **fora** do bloqueio (slug +
Client ID + Client Secret com `type="password"`, conecta/desconecta via
`perfilFetch("/pixgg")`/`"/pixgg/desconectar"`, é a ponte ativa de
verdade) e saldo/chave Pix/saque ficam **dentro** do mesmo
`.perfil-disabled-wrap`/`"Em breve"` que Doações já usa -- porque
`pix.send` (envio via API) na Efí Produção segue com o limite diário
minúsculo de conta nova ainda não liberado no dashboard deles (ver
`docs/STATUS-EFI.md`, não é bug de código, é uma ação pendente do lado do
cliente). Validação e normalização de chave Pix por tipo (aleatória/CPF-
CNPJ/celular/email) foi portada 1:1 de `perfil.js` (`normalizePixKey`),
incluindo o detalhe de auto-prefixar `+55` em celular. Testado contra
`window.fetch` mockado: conectar pixgg.com bate no payload certo e mostra
feedback de sucesso, histórico de saques renderiza os 3 status
(`pending`/`sent`/`failed` com a razão da falha), e `getComputedStyle`
confirma `pointer-events: none` na área bloqueada -- mesmo padrão de
verificação já usado nas abas anteriores.

**Reformulação visual pediu pra ficar em cima da paleta atual, não uma
nova** (2026-08-17 -- diferente do Histórico, que teve exceção de cor
autorizada; aqui o cliente rejeitou uma proposta de paleta nova e pediu
"faça em cima do nosso visual atual"). O que mudou foi só refino, sem
trocar cor nenhuma: `lifetimeEarnedCents` (já existia na resposta de
`/api/perfil`, nunca tinha sido mostrado no mount do hub) virou um número
de destaque na própria identidade da sidebar (`.perfil-lifetime`), a
sidebar ganhou o mesmo glow-atrás-do-painel que `.host-panel`/`.timer-panel`
do board já usam (`.perfil-sidebar::before`, `var(--accent-glow)` --
como o hub não seta `data-theme`, isso sempre resolve pro tema "cinza"
default, não pela cor do leilão do streamer, e tá tudo bem assim) e os
`.perfil-stat-card` ganharam cantos levemente assimétricos por posição
(`:nth-of-type(2n+1/2n+2)`), mesma sensação "cortado à mão" do
`.lot-card` do board. Esse é o padrão de polish a repetir nas próximas
abas: melhorar dentro da linguagem visual já existente, não reinventar.

O link do widget OBS **precisa** referenciar um leilão específico (a URL
carrega o `leilaoId`, isso é estrutural) -- o Perfil mostra o leilão mais
recente do streamer como representante (`registry.listLeiloesByOwner`
ordenado por `createdAt`), mesmo critério que `/api/ranking` já usa pra
agrupar o total de doações por dono. Streamer com mais de um leilão vê um
aviso com link pro hub (`/painel`).

**Doações e bloqueio de doador**: `GET /api/perfil/donations` lista o
histórico de doações PAGAS do streamer (todos os leilões, via `payments`
no Postgres, busca opcional por nome). `POST /api/perfil/donations/:id/block`
bloqueia o doador daquela doação específica. O nome do doador é texto livre
sem autenticação nenhuma (qualquer um digita qualquer nome), então bloquear
só por nome é fácil de burlar -- por isso o bloqueio guarda também o IP
daquela doação (`payments.donor_ip`, capturado via `req.ip` na rota
`/api/l/:id/doacao`; `app.set("trust proxy", 1)` já garante que é o IP real
do cliente, não o do proxy da Railway) e a checagem em
`blockedDonorsStore.isBlocked` recusa se nome OU IP bater. Isso já é IP
coletado de propósito pra rate limit e a política de privacidade já avisa
que serve "pra prevenir fraude" -- não é coleta nova. Tabela
`streamer_blocked_donors` (migration 011), por conta como o resto do
Perfil.

### Overlay OBS (`alerta.html` + `alerta.js`)

Fundo transparente forçado (`background: transparent !important`, grain
desligado). Fila simples (`queue` + flag `showing`). TTS: se o evento tem
nota+voz, busca `/api/tts`, toca como `Audio`, com **timeout de segurança de
12s** pra nunca travar a fila se o áudio falhar. Chime sintetizado via Web
Audio API (osciladores, sem arquivo de som) -- tom diferente pra apoio vs
sabotagem. Qual preset tocar (`CHIME_PRESETS` em `alerta.js`: classic/
arcade/chill/bell) vem de `GET /api/l/:id/alert-config` no load da página
(rota pública, sem sessão -- o overlay do OBS não tem cookie), que resolve
leilão → dono → `streamer_alert_prefs` (migration 010). A escolha em si é
feita no Perfil, nunca por leilão -- `serializeLeaderboard` (síncrono,
chamado toda hora em `broadcastUpdate`) não busca essa preferência, de
propósito, pra não colocar consulta ao Postgres no caminho quente do
socket (doação chega o tempo todo, trocar de som é raro). Troca ao vivo
com o overlay já aberto funciona mesmo assim: `POST
/api/perfil/alert-chime` emite `io.to(leilaoId).emit("alert-config", ...)`
pra todo leilão do streamer só nesse momento raro (troca de preferência),
nunca a cada doação -- `alerta.js` escuta esse evento além do fetch
inicial.

Além dos 4 presets sintetizados, o streamer pode subir um áudio próprio
(`chime = "custom"`, `custom_sound_url` em `streamer_alert_prefs`,
migration 012). Upload em `POST /api/perfil/alert-sound` (multer, mesmo
padrão de `UPLOADS_DIR`/Volume da imagem de fundo do board), com limite
de 10s de duração (pedido explícito, sem negociação) validado no servidor
via `music-metadata` (`parseFile`, lê metadata sem precisar de
ffmpeg/ffprobe no Railway) -- checagem no cliente antes do upload é só
UX, quem barra de verdade é o servidor. `streamerAlertPrefsStore.setChime`
recusa selecionar `"custom"` se o streamer nunca subiu um áudio ainda.
`alerta.js` pré-carrega o `<audio>` assim que a página abre (não só na
primeira doação, pra não ter latência no primeiro alerta da live) e cai
pro preset `classic` sintetizado se o arquivo falhar ao carregar ou tocar.

## Convenções gerais do projeto

- Sem comentários explicativos triviais no código — só quando o *porquê* não é óbvio (ver exemplos reais: `pool.on("error")` em `src/pg.js`, `z-index:0` proposital em `style.css`, mod code mascarado por padrão em `app.js`).
- **Cuidado com closures passados como callback pra algo que dispara `broadcastUpdate`/`serializeLeaderboard` de novo** (`getDonorAvatar` em `server.js`): já derrubou produção inteira por OOM (heap de 11MB pra 1.7GB em ~20s) porque cada chamada criava um closure novo, e cada avatar resolvido disparava todos os closures acumulados no Set de espera, cascata exponencial. Fix foi um callback **estável** por `leilaoId` (`getAvatarResolvedCallback`), pra o Set deduplicar por referência. Qualquer novo callback nesse mesmo padrão (dispara em resposta assíncrona, dentro de algo chamado repetidamente) precisa da mesma cautela.
- `promptDialog`/`confirmDialog` do site no lugar de `prompt()`/`confirm()` nativos do navegador — nunca usar os nativos em código novo.
- Ícones sempre SVG inline, nunca emoji.
- Todo texto em pt-BR, sem travessão (—) em prosa — preferir ponto, dois-pontos, vírgula ou parênteses (foi removido deliberadamente por parecer "gerado por IA"); `"—"` como placeholder de valor vazio (ex: `h.archivedAt ? ... : "—"`) não conta, isso pode ficar.
- Design/UI: usar a skill `ui-ux-pro-max` silenciosamente (sem narrar) pra qualquer trabalho visual.
