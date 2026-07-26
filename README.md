# Leilão de Jogos

Placar de leilão ao vivo pra streamers: espectadores doam via Pix (Mercado
Pago) apoiando ou sabotando itens de um catálogo, o dinheiro cai direto na
conta do streamer (split automático), e o placar atualiza em tempo real —
pensado pra ficar aberto numa aba/captura de tela durante a live, não pra
espectador acessar o link diretamente.

## Como funciona

1. O streamer cria o leilão logando com a **Twitch** (confirma quem é,
   evita alguém se passar por outro streamer) e conectando o **Mercado
   Pago** (OAuth marketplace — é a conta que recebe o dinheiro).
2. Isso gera 3 links por leilão: o **placar** (`/l/:id`), a **página de
   doação** (`/l/:id/doar`, pra fixar no chat) e o **overlay pro OBS**
   (`/l/:id/alerta`, Browser Source com fundo transparente).
3. O doador abre a página de doação, escolhe um jogo numa prateleira
   (busca na RAWG + jogos já no catálogo), decide se quer **apoiar** ou
   **sabotar**, escolhe o valor e opcionalmente deixa nome + mensagem (com
   narração por voz no overlay, via Web Speech API do navegador — grátis,
   sem depender de nenhuma API paga).
4. O Pix é gerado com **split automático** (Mercado Pago `application_fee`):
   a maior parte cai direto na conta do streamer, uma fração pequena fica
   pra plataforma. O dinheiro nunca passa pela nossa conta.
5. Quando o Mercado Pago confirma o pagamento (webhook), o placar atualiza
   sozinho via Socket.IO — sem recarregar a página — e o overlay do OBS
   mostra o alerta com a voz.
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

Acesse `http://localhost:3000` pra criar um leilão. Login com a Twitch e
conexão com o Mercado Pago são obrigatórios pra criar — sem isso não dá
pra gerar leilão novo (leilões já existentes continuam funcionando
normalmente mesmo se as chaves sumirem depois).

Se for usar o Postgres (guarda credencial OAuth do Mercado Pago, histórico
de pagamento e cópia de segurança do estado do leilão — ver comentário de
`DATABASE_URL` no `.env.example`), rode as migrations depois de configurar:

```bash
node scripts/migrate.js
```

## Publicar (deploy)

O projeto é hoje mantido rodando no **Railway**:
- Precisa de um **Volume persistente** montado no serviço, apontando pra
  `DATA_DIR` (é onde o catálogo/eventos de cada leilão fica, em JSON).
- Precisa de um serviço **Postgres** ligado (credencial OAuth, pagamentos,
  backup do estado — ver `.env.example`).
- As URLs de callback do OAuth (Twitch e Mercado Pago) e do webhook do
  Mercado Pago precisam apontar pro domínio real de produção (o Mercado
  Pago exige HTTPS até pra teste, então o fluxo de conectar conta não
  funciona em `localhost` puro).

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

- **Jogos** → **RAWG** (banco de dados aberto com mais de 500 mil jogos).
  Crie uma chave grátis em https://rawg.io/apidocs e coloque em
  `RAWG_API_KEY` no `.env`.
- **Filmes** → **TMDB** (The Movie Database). Crie uma chave grátis em
  https://www.themoviedb.org/settings/api ("API Key (v3 auth)") e coloque
  em `TMDB_API_KEY` no `.env`.

Sem a chave correspondente, o site funciona normalmente, só que sem as
miniaturas (aparece um quadradinho com a inicial no lugar) — mesmo
fallback usado quando um item específico não é encontrado na busca.

## Estrutura do projeto

```
server.js                  Express + Socket.IO + todas as rotas de API
src/parser.js               normaliza/casa nome de jogo digitado (fuzzy match)
src/db.js                   armazenamento em JSON por leilão (catálogo, eventos)
src/stores.js                cache em memória dos leilões ativos + eviction
src/registry.js              catálogo de leilões (id -> dono, título)
src/session.js               cookie de sessão assinado (login Twitch)
src/twitchAuth.js/twitchClient.js   OAuth da Twitch + busca de avatar
src/mpAuth.js/mpApi.js/mpWebhook.js  OAuth do Mercado Pago + criação/confirmação de Pix
src/streamersStore.js/paymentsStore.js  Postgres: credencial OAuth e histórico de pagamento
src/tokenCrypto.js           cifra os tokens do Mercado Pago em repouso
src/stateBackup.js           cópia de segurança periódica do estado do leilão no Postgres
src/gameImages.js/movieImages.js    busca de capa na RAWG e na TMDB
src/mediaAdapter.js          escolhe RAWG ou TMDB pela modalidade do leilão
public/index.html            criação de leilão
public/board.html            placar + painel de apresentador
public/doar.html             página de doação
public/alerta.html           overlay pro OBS
public/meus-leiloes.html     lista dos leilões do streamer logado
scripts/migrate.js           aplica as migrations SQL em src/migrations/
```
