# Leilão de Jogos — integrado com pix.gg (LivePix)

Site de placar ao vivo para leilão de jogos: espectadores doam pelo LivePix
(pix.gg), escrevem o nome do jogo na mensagem, e o placar atualiza sozinho.

## Como funciona

1. O espectador doa e escreve, por exemplo, `+Elden Ring` (apoiar) ou
   `-Hollow Knight` (tirar pontos de um jogo rival). Sem prefixo também
   conta como apoio.
2. O LivePix chama seu servidor (`/webhook/livepix`) avisando que chegou
   uma mensagem nova — mas só manda o ID, não os detalhes.
3. Seu servidor busca os detalhes completos na API do LivePix (valor,
   usuário, texto da mensagem), interpreta o texto e atualiza o placar.
4. O placar (index.html) e o painel admin recebem a atualização em tempo
   real via WebSocket (Socket.io) — sem precisar recarregar a página.

## 1. Configurar o app no LivePix

1. Crie uma conta em https://livepix.gg (se ainda não tiver).
2. Vá em **Configurações > Aplicações** e crie uma nova aplicação.
3. Copie o `client_id` e o `client_secret`.
4. Garanta que a aplicação tenha permissão de leitura de **mensagens** e de
   **webhooks** (os nomes exatos dos escopos aparecem no painel deles —
   ajuste `SCOPES` em `src/livepixClient.js` se o nome for diferente do que
   já deixei configurado).

## 2. Rodar localmente

```bash
npm install
cp .env.example .env
# edite o .env com seu client_id, client_secret e uma senha de admin
npm start
```

Acesse:
- Placar público: http://localhost:3000
- Painel admin: http://localhost:3000/admin.html

## 3. Publicar (deploy)

O webhook do LivePix precisa de uma URL pública com HTTPS — então rodar só
na sua máquina não é suficiente para receber doações de verdade. Formas
simples de publicar (grátis ou baratas):

- **Railway** (railway.app) — conecta direto num repositório GitHub, detecta
  o `package.json` e sobe sozinho.
- **Render** (render.com) — mesma ideia, plano free funciona bem para isso.
- **Fly.io** — para quem já tem alguma familiaridade com deploy via CLI.

Passos gerais (Railway/Render):
1. Suba esta pasta para um repositório no GitHub.
2. Crie um novo projeto/serviço apontando pro repositório.
3. Configure as variáveis de ambiente do `.env` no painel do provedor
   (`LIVEPIX_CLIENT_ID`, `LIVEPIX_CLIENT_SECRET`, `ADMIN_PASSWORD`,
   `PUBLIC_URL`, `AUCTION_TITLE`).
4. `PUBLIC_URL` deve ser a URL que o provedor te dá (ex:
   `https://leilao-jogos.up.railway.app`).
5. Depois do primeiro deploy, registre o webhook automaticamente: entre
   no painel admin (`/admin.html`) → botão **"Registrar webhook"**. Ou
   rode localmente: `npm run setup-webhook` (com o `.env` apontando pro
   `PUBLIC_URL` já publicado).

> Os dados ficam salvos num arquivo `leilao-data.json` na pasta do projeto —
> não precisa instalar nem configurar nenhum banco de dados. Só um detalhe:
> em alguns provedores de hospedagem gratuitos (Railway/Render free tier) o
> sistema de arquivos é apagado a cada novo deploy. Se isso acontecer com
> você e os dados sumirem depois de atualizar o código, me avisa que eu
> adapto pra usar um "disco persistente" do provedor (é só marcar uma opção
> no painel deles).

## 4. Divulgar pros espectadores

Mostre no placar (já incluso no site) ou fale na live:

> Doe pelo pix.gg e escreva `+Nome do Jogo` na mensagem pra apoiar, ou
> `-Nome do Jogo` pra tirar pontos de um jogo que você não quer que
> ganhe. Os 3 mais votados no fim da live entram na fila!

## 5. Painel de administração

Em `/admin.html` (senha = `ADMIN_PASSWORD` do `.env`) você pode:

- Ver o placar em tempo real numa tabela.
- **Mesclar jogos duplicados** (ex.: "elden ring" e "eldenring" escritos
  de formas diferentes por pessoas diferentes).
- Corrigir valores manualmente, renomear ou excluir um jogo.
- Lançar uma doação manual (útil se alguém pagar fora do app, ou pra
  testar o sistema sem esperar um pix de verdade).
- Encerrar o leilão (novas doações passam a ser ignoradas para efeito de
  pontuação, mas continuam aparecendo no ticker como "não contabilizada").
- Trocar o título exibido no placar.
- Zerar tudo pra começar um novo leilão.

## Estrutura do projeto

```
server.js              servidor Express + Socket.io + rota do webhook
src/parser.js           interpreta a mensagem da doação (+jogo / -jogo)
src/db.js                armazenamento em arquivo JSON (jogos, eventos, idempotência)
src/livepixClient.js    OAuth2 + chamadas à API do LivePix
public/index.html       placar público
public/admin.html       painel de administração
scripts/setup-webhook.js  registra o webhook via linha de comando
```

## 6. Capas dos jogos (automático)

Quando um jogo novo entra no leilão (via pix ou lançamento manual), o
servidor busca a capa dele na **RAWG** (banco de dados aberto com mais de
500 mil jogos) e mostra uma miniatura ao lado do nome.

1. Crie uma chave grátis em https://rawg.io/apidocs.
2. Coloque em `RAWG_API_KEY` no `.env`.
3. Pronto — não precisa fazer mais nada, a busca é automática.

Sem a chave configurada, o site funciona normalmente, só que sem as
miniaturas (aparece um quadradinho com a inicial do jogo no lugar).

Jogos bem conhecidos (Elden Ring, Hollow Knight, etc.) quase sempre têm
capa. Jogos muito obscuros, indies bem novos ou nomes digitados de forma
estranha podem não encontrar nada — nesse caso também cai no quadradinho
com a inicial, sem quebrar o layout.

> O plano gratuito da RAWG exige um crédito visível no site linkando pra
> eles — já deixei isso no rodapé da página, não precisa mexer.

## Testando sem esperar uma doação real

Use o **lançamento manual** no painel admin, ou chame a API direto:

```bash
curl -X POST http://localhost:3000/api/admin/manual-entry \
  -H "Content-Type: application/json" \
  -H "x-admin-password: SUA_SENHA" \
  -d '{"name":"Elden Ring","amount":25.5,"action":"add","username":"teste"}'
```
