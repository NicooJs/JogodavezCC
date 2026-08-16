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
- **`promptDialog`/`confirmDialog`**: **duas implementações separadas, não compartilham módulo** — uma em `public/js/settings.js` (board), outra em `public/js/meus-leiloes.js`. Ambas retornam Promise, mesmo padrão de overlay (`.dialog-overlay`, `z-index: 70`, regra em `style.css` já que várias páginas usam).
- **Sidebar de navegação com ícone + label dentro de modal**: `.settings-nav`/`.settings-nav-item` em `settings.css`, mesmo visual (ícone + label, estado ativo com fundo sólido na cor de destaque) do padrão `.perfil-nav-item` do Perfil, mas é uma implementação própria escopada ao modal, não reuso direto da classe.
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

### Hub (`painel.html` + `painel.js`)

Tela de entrada depois do login -- **por conta, não por leilão** (visual OP.GG
copiado de propósito, paleta roxa própria em `hub.css`, `--hub-accent`
referenciando o mesmo `--nav-accent` que a sidebar do board usa). Grid de
cards de "ferramentas" (hoje só Leilão e Reacts, mais vem depois); ícone de
Perfil/Configurações/Ranking/Histórico na sidebar abre um **painel lateral
deslizante** (`.side-drawer-overlay`/`.side-drawer`, `style.css`, cobre
parte da tela vindo da direita) em vez de navegar pra outra página.

**Ranking e Histórico** são só HTML montado por fetch direto (`openDrawer()`
genérico, troca o `innerHTML` do corpo do drawer a cada abertura). **Perfil**
ainda é um `<iframe src="/perfil">` dentro do drawer -- funciona porque
`/perfil` já é uma página standalone própria, mas é um atalho pendente de
reconstrução (mesma lógica abaixo, ainda não feita pro Perfil).

**Configurações NÃO é iframe do board** (foi, mudou 2026-08-15 a pedido
explícito do cliente: "não quero que abra o leilão, quero que o hub seja
uma interface diferente e independente") -- é um segundo *entry point* do
Vite (`client/settings.html` + `client/src/settings-main.jsx`, ver
`client/vite.config.js`), buildado junto do board pra dentro do mesmo
`public/board-app/`. Reaproveita o componente React de verdade
(`SettingsPanelContent`, extraído de `SettingsModal.jsx` -- o modal do
board só embrulha esse mesmo conteúdo num `.modal-overlay`) sem nunca
montar `App.jsx`/o board inteiro. `painel.js` busca `/board-app/settings.html`
sob demanda (só na primeira abertura), extrai o `<script type="module">`
com hash já resolvido pelo Vite e injeta no próprio DOM do hub -- o
`#settings-root` é um container **permanente** no `painel.html` (drawer
próprio, separado do genérico de Ranking/Histórico, que teria destruído a
raiz React ao trocar `innerHTML` pra outro conteúdo). `window.
JogodaVezSettingsPanel.mount(containerId, leilaoId)`, exposto pelo entry,
é idempotente -- reabrir só re-renderiza a raiz já existente, preserva
estado (ex: aba ativa). Esse é o padrão a repetir quando o Perfil for
reconstruído do mesmo jeito.

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

### Board/apresentador (`board.html` + `app.js`)

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
nunca a cada atualização do leaderboard.

**Recap**: estatísticas + pódio + download de imagem (canvas 2D, ver seção
de animações) + compartilhar no X. Histórico de recaps acessível via modal e
na aba Avançado das Configurações.

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

### Perfil (`perfil.html` + `perfil.js`)

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
