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

**Mercado Pago foi removido do código (2026-08-01)**. O pagamento agora é
100% via **Efí Bank**, custódia numa Conta Master única + ledger interno no
Postgres (`fee_config`, `streamer_balances`, `ledger_entries`, etc., ver
`src/ledgerStore.js`). Não existe mais OAuth por streamer — a identidade do
streamer vem só do vínculo com o Twitch (`streamersStore.ensureByTwitchUserId`),
e ele cadastra uma chave Pix própria pra receber saque, não pra receber
doação direto. **Antes de mexer em qualquer coisa relacionada a pagamento,
leia [docs/STATUS-EFI.md](docs/STATUS-EFI.md)** — o ambiente ativo
(`EFI_ENV`) por padrão é `homologacao` até a conta de Produção da Efí ser
confirmada; não reviva ideias de integração com pix.gg (abandonado há
tempos) nem assuma que o Mercado Pago ainda existe em algum lugar do código.

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

5 temas dark, todos em `public/css/style.css:1-96` via `:root[data-theme="..."]`.
O `:root` puro (sem atributo) é o tema **"ametista"** (roxo, default) — não
tem seletor próprio no CSS, é só o rótulo lógico usado no JS/servidor
(`leaderboard.theme || "ametista"`). Os outros 4 (`nebulosa`, `safira`,
`grafite`, `recife`) têm seletor explícito.

Variáveis principais por tema: `--bg`, `--surface`, `--surface-2`, `--border`,
`--border-soft`, `--text`, `--muted`, `--accent`, `--accent-text`,
`--accent-soft`, `--accent-glow`, `--accent-ink`, `--silver`. Constantes
compartilhadas (não variam por tema): `--bronze`, `--danger`, `--danger-bg`,
`--positive`, `--radius: 6px`, `--ease: cubic-bezier(.22,1,.36,1)`, `--grain`
(SVG de ruído em data-URI).

Tema é aplicado via `document.documentElement.dataset.theme = ...` em cada
tela, sincronizado por Socket.IO (`update` → `leaderboard.theme`). Troca de
tema é feita pelo apresentador (dots na presenter-bar ou swatches em
Configurações → Aparência), `POST /admin/theme`.

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
- **`promptDialog`/`confirmDialog`**: **duas implementações separadas, não compartilham módulo** — uma em `public/js/settings.js` (board), outra em `public/js/meus-leiloes.js`. Ambas retornam Promise, mesmo padrão de overlay (`z-index: 70`, acima do `.settings-overlay`).
- **Abas com indicador deslizante**: `positionPill()`/`snapPillTo()` em `settings.js`, span absoluto que acompanha `offsetWidth`/`offsetLeft` do botão ativo.
- **`.seg`** (segmented control): Apoiar/Sabotar, Sem voz/Com voz.
- **`.game-shelf`**: carrossel horizontal de capas com `scroll-snap` + máscara de fade nas bordas, populado por catálogo local + busca RAWG/TMDB debounced.
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
cadastrada depois, nas Configurações do leilão, não bloqueia a criação).
Bloco `.create-existing` mostra leilões já criados nesse navegador.
`create-intro.js` anima entrada (lib Motion) e busca `GET /api/ranking` pra
mostrar prova social ("N streamers usando"). Login Twitch é sempre
obrigatório pra criar leilão novo.

### Doação (`doar.html` + `doar.js`)

Fluxo: chega em `/l/:id/doar` → conecta Socket.IO (`query:{leilaoId}`) →
formulário (ação apoiar/sabotar, jogo via `game-shelf` com busca RAWG/TMDB,
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

**Recap**: estatísticas + pódio + download de imagem (canvas 2D, ver seção
de animações) + compartilhar no X. Histórico de recaps acessível via modal e
na aba Avançado das Configurações.

**Configurações** (4 abas com indicador deslizante): Geral (título, links de
doação/alerta, abrir/encerrar, qualifyCount), Aparência (tema, imagem de
fundo), Jogos/Filmes (lançamento manual, tabela com editar/excluir/mesclar
duplicados), Avançado (chave Pix + saldo/saque, histórico de leilões, sair
da conta, zerar leilão).

Toggle de modalidade Jogos↔Filmes fica na `presenter-bar` (não dentro de
Configurações) e troca todos os textos da UI via sistema de labels dinâmicos
(`data-label-text`/`data-label-placeholder`/`data-label-title`).

### Overlay OBS (`alerta.html` + `alerta.js`)

Fundo transparente forçado (`background: transparent !important`, grain
desligado). Fila simples (`queue` + flag `showing`). TTS: se o evento tem
nota+voz, busca `/api/tts`, toca como `Audio`, com **timeout de segurança de
12s** pra nunca travar a fila se o áudio falhar. Chime sintetizado via Web
Audio API (osciladores, sem arquivo de som) — tom diferente pra apoio vs
sabotagem.

## Convenções gerais do projeto

- Sem comentários explicativos triviais no código — só quando o *porquê* não é óbvio (ver exemplos reais: `pool.on("error")` em `src/pg.js`, `z-index:0` proposital em `style.css`, mod code mascarado por padrão em `app.js`).
- `promptDialog`/`confirmDialog` do site no lugar de `prompt()`/`confirm()` nativos do navegador — nunca usar os nativos em código novo.
- Ícones sempre SVG inline, nunca emoji.
- Todo texto em pt-BR, sem travessão (—) em prosa — preferir ponto, dois-pontos, vírgula ou parênteses (foi removido deliberadamente por parecer "gerado por IA"); `"—"` como placeholder de valor vazio (ex: `h.archivedAt ? ... : "—"`) não conta, isso pode ficar.
- Design/UI: usar a skill `ui-ux-pro-max` silenciosamente (sem narrar) pra qualquer trabalho visual.
