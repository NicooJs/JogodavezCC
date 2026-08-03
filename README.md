# JogodaVez (leilão de jogos)

Placar de leilão ao vivo pra streamers: espectadores doam via Pix apoiando
ou sabotando itens de um catálogo, e o placar atualiza em tempo real —
pensado pra ficar aberto numa aba/captura de tela durante a live, não pra
espectador acessar o link diretamente.

Pagamento via **Efí Bank**, em modelo de custódia: o dinheiro entra numa
Conta Master única da plataforma, um ledger interno (Postgres) controla
quanto cada streamer tem direito a sacar, e o streamer pede o saque pra
própria chave Pix quando quiser. Ver [docs/STATUS-EFI.md](docs/STATUS-EFI.md)
pro estado detalhado dessa integração.

## Como funciona

1. O streamer cria o leilão logando com a **Twitch** (confirma quem é,
   evita alguém se passar por outro streamer) — não precisa conectar nada
   de pagamento pra criar o leilão.
2. Isso gera 3 links por leilão: o **placar** (`/l/:id`), a **página de
   doação** (`/l/:id/doar`, pra fixar no chat) e o **overlay pro OBS**
   (`/l/:id/alerta`, Browser Source com fundo transparente).
3. O doador abre a página de doação, escolhe um jogo numa prateleira
   (busca na IGDB + jogos já no catálogo), decide se quer **apoiar** ou
   **sabotar**, escolhe o valor (mínimo R$5) e opcionalmente deixa nome +
   mensagem (com narração por voz no overlay, via síntese de voz grátis).
4. A cobrança Pix é gerada na API da Efí. Quando o pagamento é confirmado
   (webhook), o placar atualiza sozinho via Socket.IO — sem recarregar a
   página — e o overlay do OBS mostra o alerta com a voz. O valor é
   creditado no ledger interno: a maior parte fica disponível pro streamer
   sacar, uma fração pequena é a taxa da plataforma.
5. Nas Configurações do leilão, o streamer cadastra a própria chave Pix e
   pode solicitar saque do saldo acumulado a qualquer momento — o saque
   dispara um envio de Pix real via Efí, confirmado de forma assíncrona
   (webhook + reconciliação de segurança, ver `src/reconciliation.js`).
6. No fim, o placar mostra um recap (campeão, recorde de doação, maiores
   apoiadores) com opção de baixar como imagem ou compartilhar no X.

## Modo apresentador

O **dono do leilão** entra automaticamente no modo apresentador (edita
valores, pausa o timer, lança doação manual, etc.) assim que abre o board
logado com a própria Twitch — não precisa de senha nenhuma.

Pra delegar acesso a um moderador, o dono gera um **código temporário de
uso único** direto na barra do apresentador ("Código pra mod"). O código
funciona pra um único login e some assim que alguém entra com ele; pra dar
acesso de novo, é só gerar outro.

## Rodando localmente

```bash
npm install
cp .env.example .env
# preencha o .env (ver comentários de cada variável lá dentro)
npm start
```

Acesse `http://localhost:3000` pra criar um leilão. Login com a Twitch é
obrigatório pra criar (leilões já existentes continuam funcionando
normalmente mesmo se a chave sumir depois). Doação de verdade exige o
Postgres configurado e as credenciais da Efí (ver `.env.example`).

Se for usar o Postgres (identidade dos streamers, chave Pix de saque,
ledger de custódia, histórico de pagamento e cópia de segurança do estado
do leilão — ver comentário de `DATABASE_URL` no `.env.example`), rode as
migrations depois de configurar:

```bash
node scripts/migrate.js
```

## Publicar (deploy)

O projeto é hoje mantido rodando no **Railway**:
- Precisa de um **Volume persistente** montado no serviço, apontando pra
  `DATA_DIR` (é onde o catálogo/eventos de cada leilão fica, em JSON).
- Precisa de um serviço **Postgres** ligado (identidade, ledger, pagamentos,
  backup do estado — ver `.env.example`).
- A URL de callback do OAuth da Twitch precisa apontar pro domínio real de
  produção. O webhook da Efí (`/webhooks/efi/pix/:token`) também precisa
  estar registrado contra o domínio real (ver `docs/STATUS-EFI.md`).
- `EFI_ENV` controla se o site está processando contra o ambiente de
  homologação (sandbox, padrão) ou produção (dinheiro real) da Efí — trocar
  isso é a única coisa que decide se é dinheiro de verdade ou não.

## Modalidade: jogos ou filmes

Todo leilão nasce na modalidade **jogos**. O dono pode trocar pra
**filmes** a qualquer momento em Configurações → Avançado → Modalidade
do leilão — a troca **zera o catálogo e o histórico atuais** (as duas
modalidades buscam capa em fontes diferentes, então não dá pra misturar).
Todo o texto do site ("+Jogo apoia", "Buscar um jogo...", etc.) se adapta
sozinho pra "filme" quando a modalidade muda.

## Capas automáticas

Quando um item novo entra no catálogo, o servidor busca a capa dele numa
fonte externa, de acordo com a modalidade do leilão:

- **Jogos** → **IGDB** (banco de dados de jogos mantido pela Twitch/Amazon).
  Não precisa de chave nova, reaproveita `TWITCH_CLIENT_ID`/
  `TWITCH_CLIENT_SECRET` já configurados pro login.
- **Filmes** → **TMDB** (The Movie Database). Crie uma chave grátis em
  https://www.themoviedb.org/settings/api ("API Key (v3 auth)") e coloque
  em `TMDB_API_KEY` no `.env`.

Sem a chave/credencial correspondente, o site funciona normalmente, só
que sem as miniaturas (aparece um quadradinho com a inicial no lugar) —
mesmo fallback usado quando um item específico não é encontrado na busca.

## Estrutura do projeto

```
server.js                  Express + Socket.IO + todas as rotas de API
src/parser.js               normaliza/casa nome de jogo digitado (fuzzy match)
src/db.js                   armazenamento em JSON por leilão (catálogo, eventos)
src/stores.js                cache em memória dos leilões ativos + eviction
src/registry.js              catálogo de leilões (id -> dono, título)
src/session.js               cookie de sessão assinado (login Twitch)
src/twitchAuth.js/twitchClient.js   OAuth da Twitch + busca de avatar
src/efiAuth.js/efiClient.js/efiApi.js  autenticação mTLS + chamadas à API Pix da Efí
src/efiWebhook.js            valida a notificação de pagamento/envio da Efí
src/ledgerStore.js           split de doação/saque, saldo por streamer, em centavos inteiros
src/streamersStore.js/paymentsStore.js/streamerPixKeysStore.js  Postgres: identidade, histórico de pagamento, chave Pix de saque
src/reconciliation.js        resolve saques presos sem o webhook de confirmação chegar
src/stateBackup.js           cópia de segurança periódica do estado do leilão no Postgres
src/igdbApi.js/movieImages.js    busca de capa na IGDB e na TMDB
src/mediaAdapter.js          escolhe IGDB ou TMDB pela modalidade do leilão
public/index.html            criação de leilão
public/board.html            placar + painel de apresentador
public/doar.html             página de doação
public/alerta.html           overlay pro OBS
public/meus-leiloes.html     lista dos leilões do streamer logado
scripts/migrate.js           aplica as migrations SQL em src/migrations/
```
