# JogodaVez

Placar de leilão ao vivo pra streamer da Twitch. Espectador entra na
página de doação, escolhe um jogo do catálogo, manda um Pix apoiando ou
sabotando, e o placar atualiza na hora pra todo mundo que tá olhando,
inclusive no overlay do OBS. Tipo um StreamElements, só que de leilão.

## Stack

- Backend: Node.js + Express, Socket.IO pra tempo real, PostgreSQL pra
  identidade/ledger/histórico e um armazenamento próprio em JSON por
  leilão (catálogo e eventos, com cache em memória e eviction).
- Frontend: React (Vite) pro board/hub/painel do streamer, algumas
  páginas ainda em JS puro (doação, overlay do OBS).
- Auth: OAuth da Twitch, cookie de sessão assinado.
- Pagamento: confirmação de doação Pix via webhook, split
  streamer/plataforma calculado em centavos inteiros.
- Deploy: Railway, com volume persistente pro catálogo em JSON e
  Postgres gerenciado.
- Uso de IA para documentação e organização.

## Partes que deram mais trabalho

Corrida por posição: o modo "corrida" trava a classificação de um item
assim que ele bate uma meta, mesmo competindo por dinheiro com outros ao
mesmo tempo. O ranking final precisa juntar dois grupos (quem travou vaga
e quem tá disputando por valor) sem duplicar nem deixar vaga sobrando,
recalculado a cada doação.

Sincronização em tempo real entre o board React, o overlay do OBS
(Browser Source) e páginas legadas em JS puro, tudo ouvindo o mesmo
socket sem re-render pesado nem dessincronizar o timer entre navegadores
diferentes.

Avatar de doador com cache de resolução assíncrona pra não bater na API
da Twitch toda hora, incluindo um bug real de cascata que derrubou
produção por estouro de memória antes de eu achar a causa.

Reconciliação de saque: quando o webhook de confirmação de pagamento não
chega (rede caiu, provedor demorou), um job de reconciliação audita e
resolve o estado depois, sem duplicar valor nem deixar saque "preso".

Multi-streamer: cada leilão isolado por id, com cache próprio de estado e
eviction por inatividade, rodando vários leilões simultâneos no mesmo
processo sem vazamento de estado entre eles.

## Bot de chat da Twitch

Lê o chat (modo anônimo, só leitura) pra comandos tipo `!hype`/`!dislike`
nos itens do catálogo. Opcionalmente pode logar como bot de verdade pra
responder no chat quando alguém tenta usar um comando em cooldown.

---

Side project, ainda mexendo bastante.
