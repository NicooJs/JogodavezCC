require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");

const registry = require("./src/registry");
const pixggApi = require("./src/pixggApi");
const { getStore, deleteStore, DATA_DIR } = require("./src/stores");
const { verifyPassword, timingSafeEqualString } = require("./src/passwords");
const { parseMessage, normalizeKey, leftoverAfterMatch, looksLikeNoise } = require("./src/parser");
const livepix = require("./src/livepixClient");
const pixgg = require("./src/pixggClient");
const { fetchGameImage, searchGames, identifyGameFromNoisyText, fetchPopularCovers } = require("./src/gameImages");
const { fetchTwitchAvatar } = require("./src/twitchClient");
const twitchAuth = require("./src/twitchAuth");
const session = require("./src/session");

const app = express();
// Railway termina TLS na borda e repassa pro container em HTTP puro,
// marcando o protocolo real no header X-Forwarded-Proto. Sem confiar nesse
// proxy, req.protocol sempre volta "http" em produção (mesmo pra requisição
// pública https) — e é isso que monta a URL de webhook errada em
// buildWebhookUrlFromReq, fazendo o pix.gg tentar mandar POST pra uma URL
// http:// que nunca chega no app.
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Upload de imagem de fundo do board — salvo no mesmo DATA_DIR persistente
// dos dados dos leilões (volume do Railway em produção), não em disco
// efêmero do container. Nome do arquivo prefixado com o leilaoId + horário
// pra não colidir entre leilões nem ficar em cache velho do navegador
// quando o streamer troca a imagem.
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const backgroundImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_IMAGE_TYPES[file.mimetype] || "";
      cb(null, `${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB — imagem de fundo, não precisa de mais
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
      return cb(new Error("Envie uma imagem PNG, JPG, WEBP ou GIF"));
    }
    cb(null, true);
  },
});

// Se a imagem de fundo ATUAL desse leilão foi um upload nosso (serve de
// /uploads/...), apaga o arquivo antes de trocar por outra — sem isso, cada
// troca de imagem (ou volta pra uma URL externa) deixava o arquivo antigo
// órfão pra sempre no volume persistente. Uma URL externa (Imgur etc) não
// tem arquivo nosso pra apagar, então é no-op nesse caso. Best-effort: erro
// ao apagar só loga, não impede a troca da imagem nova.
function deleteOldUploadedBackground(store) {
  const current = store.getState("backgroundImageUrl");
  if (!current || !current.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(current));
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") console.error("Falha ao apagar imagem de fundo antiga:", err.message);
  });
}

// Apaga qualquer imagem de fundo que esse leilão tenha enviado por upload
// (nome sempre prefixado "<leilaoId>-", ver backgroundImageUpload acima) —
// chamado ao apagar o leilão inteiro (rota de super-admin), senão o arquivo
// ficava pra trás no volume pra sempre (deleteStore só apaga o JSON de
// dados). Varre por prefixo em vez de confiar só no backgroundImageUrl
// guardado, então também limpa órfãos que já tenham sobrado de antes dessa
// correção existir.
function deleteUploadedBackgroundsFor(leilaoId) {
  let files;
  try {
    files = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return;
  }
  const prefix = `${leilaoId}-`;
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    fs.unlink(path.join(UPLOADS_DIR, file), (err) => {
      if (err && err.code !== "ENOENT") console.error("Falha ao apagar imagem de fundo órfã:", err.message);
    });
  }
}

const DEFAULT_AUTO_CLOSE_MS = 5 * 60 * 1000; // 5 minutos sem atividade encerra sozinho

// O pix.gg manda um GET periódico na URL do webhook (ping de saúde, ver
// CLAUDE.md), mas a frequência real não é documentada e variou bastante na
// prática — um threshold de 5min já deu alarme falso em uso normal. 30min é
// bem mais folgado; combinado com só checar isso enquanto o leilão está
// aberto (ver isWebhookStale), o objetivo é só pegar um desvínculo real no
// meio de uma live longa, não qualquer intervalo maior entre pings.
const WEBHOOK_STALE_MS = 30 * 60 * 1000;

function getAutoCloseMs(store) {
  const stored = Number(store.getState("timerDurationMs", DEFAULT_AUTO_CLOSE_MS));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_AUTO_CLOSE_MS;
}

const DEFAULT_QUALIFY_COUNT = 3;

// Quantos lotes contam como "classificados" (linha de corte no catálogo,
// ver .qualify-divider em app.js) — configurável por leilão desde que
// streamers com catálogos maiores (mais de 3 jogos "de verdade" em disputa)
// pediram pra não ficar preso em top 3 fixo.
function getQualifyCount(store) {
  const stored = Number(store.getState("qualifyCount", DEFAULT_QUALIFY_COUNT));
  return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : DEFAULT_QUALIFY_COUNT;
}

// Nem todo streamer quer expor quanto arrecadou pro público — pedido
// explícito do cliente. Quando ligado, o total agregado (topbar + recap)
// vira null na API pública (não só escondido via CSS: alguém olhando a
// rede/inspecionar elemento não pode simplesmente ler o número real, ver
// CLAUDE.md sobre cuidado com informação exposta). Os valores de CADA lote
// continuam aparecendo — isso é o mecanismo do leilão em si, não o total
// pessoal do streamer.
function getHideTotalRaised(store) {
  return store.getState("hideTotalRaised", "false") === "true";
}

// Verdadeiro quando host/hostAvatar vieram do login de verdade com a Twitch
// na criação (ver POST /api/leiloes) -- não editável depois (o recurso de
// renomear o host foi removido: com o login obrigatório, não fazia mais
// sentido deixar trocar o nome manualmente). Só falso pra leilão criado
// antes desse login existir.
function getHostVerified(store) {
  return store.getState("hostVerified", "false") === "true";
}

// ---------- sessão / login com a Twitch ----------

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 dias
const OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10 min — só o tempo de ida e volta pro id.twitch.tv

// Allowlist EXATA (não regex "parece caminho relativo") pra onde o login
// pode redirecionar de volta — fecha open-redirect sem ter superfície de
// parsing pra acertar errado (barra dupla, normalização de barra invertida
// etc. são os jeitos clássicos de um regex desses vazar).
const ALLOWED_RETURN_PATHS = new Set(["/", "/meus-leiloes"]);
function safeReturnTo(value) {
  return ALLOWED_RETURN_PATHS.has(value) ? value : "/";
}

function buildTwitchRedirectUri(req) {
  return `${req.protocol}://${req.get("host")}/auth/twitch/callback`;
}

// payload só tem twitchUserId quando veio de um login de verdade (ver
// /auth/twitch/callback) — nunca confiar em identidade que não passou por
// aqui.
function getTwitchSession(req) {
  const payload = session.getCookie(req, "leilao_session");
  return payload && payload.twitchUserId ? payload : null;
}

// ---------- helpers ----------

function centsToNumber(cents) {
  return Math.round(cents) / 100;
}

// Marca "agora" como o último lance recebido (reinicia a contagem de 5 min).
// reopen=true também garante que o leilão volte a ficar aberto, e marca
// "agora" como início dessa sessão aberta (ver leilaoOpenedAt em
// isWebhookStale) — sem isso, reabrir um leilão que ficou fechado um tempo
// mostra o aviso de webhook desvinculado na hora, mesmo sem nada quebrado,
// só porque o último ping/contato é de antes de fechar.
function touchActivity(store, reopen = false) {
  store.setState("lastActivityAt", String(Date.now()));
  if (reopen) {
    store.setState("open", "true");
    store.setState("leilaoOpenedAt", String(Date.now()));
  }
}

// Guarda quanto tempo essa sessão aberta durou, no momento de fechar (manual
// ou automático) — usado pelo recap de encerramento. Calculado aqui (e não
// só na hora de exibir o recap) pra ficar estável mesmo que o cliente
// reconecte ou recarregue a página depois do leilão já ter fechado.
function captureAuctionDuration(store) {
  const openedAt = Number(store.getState("leilaoOpenedAt", 0));
  if (openedAt > 0) {
    store.setState("lastAuctionDurationMs", String(Date.now() - openedAt));
  }
}

// Chamada nos dois pontos onde o leilão fecha (toggle manual e auto-close
// por inatividade) — pedido do cliente: encerrar já deve contar no
// histórico/ranking, sem precisar zerar depois. Ver openRound em
// src/db.js#archiveAuction pra como isso evita contar o mesmo dinheiro
// duas vezes se reabrir e fechar de novo sem zerar.
function archiveOpenRoundSnapshot(store) {
  const recap = buildRecap(store);
  if (recap.totalGames > 0) store.archiveAuction(recap, { openRound: true });
}

// Marca "agora" como o último contato de verdade do pix.gg nessa URL de
// webhook (GET de ping ou POST com assinatura válida) — usado só pra
// detectar desvinculação, ver WEBHOOK_STALE_MS e isWebhookStale.
function touchWebhookPing(store) {
  store.setState("lastWebhookPingAt", String(Date.now()));
}

// Só considera "desvinculado por silêncio" enquanto o leilão está aberto —
// fora de uma live, silêncio é o esperado, não é sinal de nada quebrado.
// Isso mais o threshold folgado (WEBHOOK_STALE_MS) é a resposta ao falso
// positivo que já rolou em produção com um threshold de 5min sem essa
// condição de "aberto".
//
// A referência é a mais recente entre: último ping/POST de verdade, criação
// do leilão, e início da sessão aberta atual (leilaoOpenedAt, marcado no
// reabrir — ver touchActivity). Sem esse último, reabrir um leilão que
// ficou fechado (silêncio normal, esperado) fazia o aviso aparecer na hora,
// porque o último contato real podia ser de muito antes de fechar — outro
// falso positivo já visto em produção.
function isWebhookStale(store, isOpen) {
  if (!isOpen) return false;
  const lastPing = Number(store.getState("lastWebhookPingAt", 0));
  const createdAt = new Date(store.getState("createdAt", new Date().toISOString())).getTime();
  const openedAt = Number(store.getState("leilaoOpenedAt", 0));
  const referenceTime = Math.max(lastPing, createdAt, openedAt);
  return Date.now() - referenceTime > WEBHOOK_STALE_MS;
}

// Diferente de isWebhookStale (que olha só se ALGUM contato chegou nessa
// URL, via GET ou POST): isso olha especificamente se o POST de doação real
// tem batido com a assinatura errada/ausente — sinal concreto de URL
// incompleta/cortada (ver rota POST /webhook/pixgg/:leilaoId). Baseado numa
// falha de verdade que aconteceu, não em inferência de silêncio.
function hasWebhookSignatureIssue(store) {
  return store.getState("webhookSignatureBroken", "false") === "true";
}

// Melhor esforço pra achar a foto de perfil de um doador na Twitch, usando
// o nome que ele digitou na mensagem do pix.gg como se fosse o login dele —
// funciona quando bate (a maioria dos apoiadores usa o mesmo nick), e
// silenciosamente não mostra nada quando não bate (não tem como confirmar
// identidade a partir só do nome digitado). Cache global (não por leilão,
// login é global). Nunca bloqueia a resposta: se ainda não tem no cache,
// devolve null nessa chamada -- mas quem chamou pode passar onResolved, que
// dispara um broadcast assim que a busca terminar, pra quem já tava vendo o
// placar receber a foto sem precisar que role outra doação (ou um F5) nesse
// meio tempo. donorAvatarFetching guarda os onResolved de todo mundo
// esperando o MESMO username (pode vir de leilões diferentes ao mesmo
// tempo) -- um Set evita chamar o mesmo callback 2x se dois lotes do mesmo
// leilão pedirem o mesmo doador na mesma passada de serializeLeaderboard.
const donorAvatarCache = new Map(); // username normalizado -> url|null
const donorAvatarFetching = new Map(); // username normalizado -> Set de onResolved esperando

function getDonorAvatar(username, onResolved) {
  if (!username) return null;
  const key = username.trim().toLowerCase();
  if (donorAvatarCache.has(key)) return donorAvatarCache.get(key);

  let waiters = donorAvatarFetching.get(key);
  if (!waiters) {
    waiters = new Set();
    donorAvatarFetching.set(key, waiters);
    fetchTwitchAvatar(key)
      .then((url) => {
        donorAvatarCache.set(key, url);
        if (url) waiters.forEach((cb) => cb());
      })
      .catch(() => {})
      .finally(() => donorAvatarFetching.delete(key));
  }
  if (onResolved) waiters.add(onResolved);
  return null;
}

// Se a chave já existe, usa ela direto. Senão, tenta casar com um jogo já
// existente no catálogo (ruído na mensagem ou erro de digitação — ver
// resolveExistingKey em db.js). Se ainda assim não achar nada (é a
// PRIMEIRA menção desse jogo, sem lote de referência local pra comparar),
// tenta extrair o nome limpo batendo contra a RAWG antes de desistir e
// aceitar o texto inteiro como nome do lote.
async function resolveParsedGame(store, parsed) {
  if (store.hasGame(parsed.key)) return parsed;

  const matchedKey = store.resolveExistingKey(parsed.key);
  if (matchedKey) {
    // O jogo já catalogado bate por substring dentro da mensagem nova (ver
    // resolveExistingKey em db.js) — mas isso pode ser ruído de chat em volta
    // do MESMO jogo ("minecraft manda ver!!") ou pode ser um jogo diferente
    // de verdade com nome parecido ("Elden Ring Nightreign" batendo com
    // "Elden Ring" já existente). Só aceita o match direto quando o que
    // sobra parece ruído comum; caso contrário, confere na RAWG se o texto
    // inteiro identifica um jogo diferente antes de fundir num lote alheio.
    const leftover = leftoverAfterMatch(parsed.key, matchedKey);
    if (!looksLikeNoise(leftover)) {
      const rawgMatch = await identifyGameFromNoisyText(parsed.name);
      if (rawgMatch) {
        const rawgKey = normalizeKey(rawgMatch.name);
        if (rawgKey !== matchedKey) {
          return { ...parsed, key: rawgKey, name: rawgMatch.name };
        }
      }
    }
    const existing = store.getGame(matchedKey);
    return { ...parsed, key: matchedKey, name: existing.name };
  }

  const rawgMatch = await identifyGameFromNoisyText(parsed.name);
  if (rawgMatch) {
    return { ...parsed, key: normalizeKey(rawgMatch.name), name: rawgMatch.name };
  }

  return parsed;
}

function serializeLeaderboard(store, leilaoId) {
  // Passado pro getDonorAvatar de cada doador nessa passada -- se a foto
  // ainda não tava em cache e precisou buscar na Twitch, isso é o que avisa
  // quem já tava vendo o placar assim que ela chegar (ver comentário de
  // getDonorAvatar acima). Sem leilaoId (nenhum call site hoje cai nisso,
  // mas é uma guarda barata) simplesmente não teria como fazer esse
  // broadcast, então nem tenta.
  const onAvatarResolved = leilaoId ? () => broadcastUpdate(leilaoId, store, null) : undefined;
  const rows = store.getLeaderboard();
  const isOpen = store.getState("open", "true") === "true";
  const isPaused = isOpen && store.getState("paused", "false") === "true";
  const lastActivityAt = Number(store.getState("lastActivityAt", Date.now()));
  const autoCloseMs = getAutoCloseMs(store);
  const funding = store.getFundingBreakdown();
  const topDonorByGame = store.getTopDonorByGame();
  const qualifyCount = getQualifyCount(store);
  const items = rows.map((row, index) => {
    const rowFunding = funding[row.key] || { added_cents: 0, removed_cents: 0 };
    const topDonor = topDonorByGame[row.key];
    return {
      key: row.key,
      name: row.name,
      total: centsToNumber(row.total_cents),
      added: centsToNumber(rowFunding.added_cents),
      removed: centsToNumber(rowFunding.removed_cents),
      rank: index + 1,
      winning: index < qualifyCount,
      image: row.image_url || null,
      topDonor: topDonor
        ? { username: topDonor.username, total: centsToNumber(topDonor.total_cents), avatar: getDonorAvatar(topDonor.username, onAvatarResolved) }
        : null,
    };
  });

  const donors = store.getTopDonors(10).map((d, index) => ({
    username: d.username,
    total: centsToNumber(d.total_cents),
    rank: index + 1,
    avatar: getDonorAvatar(d.username, onAvatarResolved),
  }));

  return {
    title: store.getState("title", "Leilão de Jogos"),
    host: store.getState("host", ""),
    hostAvatar: store.getState("hostAvatar", null),
    hostVerified: getHostVerified(store),
    hostTwitchLogin: store.getState("hostTwitchLogin", null),
    theme: store.getState("theme", "ametista"),
    backgroundImageUrl: store.getState("backgroundImageUrl", null),
    qualifyCount,
    open: isOpen,
    paused: isPaused,
    items,
    lastSabotagedKey: store.getState("lastSabotagedKey", null),
    donors,
    donorNames: store.getDonorNames(),
    totalRaised: getHideTotalRaised(store) ? null : centsToNumber(store.getTotalRaised()),
    hideTotalRaised: getHideTotalRaised(store),
    timerEndsAt: isOpen && !isPaused ? lastActivityAt + autoCloseMs : null,
    timerRemainingMs: isPaused ? Number(store.getState("pausedRemainingMs", autoCloseMs)) : null,
    timerDurationMs: autoCloseMs,
    webhookStale: isWebhookStale(store, isOpen),
    webhookSignatureIssue: hasWebhookSignatureIssue(store),
  };
}

// Resumo mostrado numa janela quando o leilão encerra (manual ou automático)
// — TOP 3 lotes com quantos doadores cada um teve, maiores doadores gerais,
// total arrecadado e duração. Duração vem de lastAuctionDurationMs
// (capturado no momento de fechar, ver captureAuctionDuration) — se ainda
// não existe (leilão nunca fechou por essa rota, ex: dado antigo), cai pra
// null em vez de inventar um número.
function buildRecap(store) {
  const rows = store.getLeaderboard();
  const donorCounts = store.getDonorCountByGame();
  const topDonorByGame = store.getTopDonorByGame();
  // slice(0, 3) fixo antes -- leilão configurado pra mais de 3 classificados
  // (getQualifyCount, painel "Quantos lotes contam como classificados")
  // arrecadava certo mas o recap só mostrava os 3 primeiros mesmo assim.
  const topGames = rows.slice(0, getQualifyCount(store)).map((row, index) => {
    const topDonor = topDonorByGame[row.key];
    return {
      rank: index + 1,
      key: row.key,
      name: row.name,
      total: centsToNumber(row.total_cents),
      image: row.image_url || null,
      donorCount: donorCounts[row.key] || 0,
      topDonor: topDonor
        ? { username: topDonor.username, total: centsToNumber(topDonor.total_cents), avatar: getDonorAvatar(topDonor.username) }
        : null,
    };
  });

  const topDonors = store.getTopDonors(5).map((d, index) => ({
    rank: index + 1,
    username: d.username,
    total: centsToNumber(d.total_cents),
  }));

  const biggest = store.getBiggestDonation();
  const biggestDonation = biggest
    ? { username: biggest.username, amount: centsToNumber(biggest.amount_cents), gameName: biggest.game_name }
    : null;

  const durationMs = Number(store.getState("lastAuctionDurationMs", 0)) || null;

  return {
    title: store.getState("title", "Leilão de Jogos"),
    host: store.getState("host", ""),
    totalRaised: getHideTotalRaised(store) ? null : centsToNumber(store.getTotalRaised()),
    totalGames: rows.length,
    totalDonors: store.getTotalDonorCount(),
    durationMs,
    topGames,
    topDonors,
    biggestDonation,
  };
}

function broadcastUpdate(leilaoId, store, lastEvent) {
  io.to(leilaoId).emit("update", { leaderboard: serializeLeaderboard(store, leilaoId), lastEvent });
}

// Roda em segundo plano: não atrasa a resposta do webhook nem do formulário.
// Quando a imagem chega, manda uma atualização nova pro placar. Tenta de novo
// sempre que o jogo ainda não tem capa (jogo novo, ou capa que falhou antes
// por falta de chave/erro passageiro da RAWG).
function maybeFetchGameImage(leilaoId, store, key, name, needsImage) {
  if (!needsImage) return;
  fetchGameImage(name)
    .then((imageUrl) => {
      if (!imageUrl) return;
      store.setGameImage(key, imageUrl);
      broadcastUpdate(leilaoId, store, null);
    })
    .catch((err) => console.error("Falha ao buscar imagem do jogo:", err.message));
}

// Resolve :id da rota pra um leilão de verdade, ou 404. Todo o resto do
// pipeline (rotas, sockets) depende de já ter passado por aqui.
function loadLeilao(req, res, next) {
  const id = req.params.id;
  if (!/^[a-z0-9_-]+$/i.test(id) || !registry.leilaoExists(id)) {
    return res.status(404).json({ error: "Leilão não encontrado" });
  }
  req.leilaoId = id;
  req.store = getStore(id);
  next();
}

// Aditivo, não substitui a senha: o dono verificado da Twitch (sessão
// logada nesse navegador, comparada ao ownerTwitchUserId do registro)
// também libera acesso, sem precisar digitar senha. Continua funcionando
// por senha pra quem administra de outro dispositivo/navegador sem sessão.
function requireLeilaoAdmin(req, res, next) {
  const supplied = req.header("x-admin-password") || "";
  const hash = req.store.getState("adminSecretHash");
  if (verifyPassword(supplied, hash)) return next();

  const session = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  if (session && meta && meta.ownerTwitchUserId && session.twitchUserId === meta.ownerTwitchUserId) {
    return next();
  }

  return res.status(401).json({ error: "Senha de admin inválida" });
}

async function processDonationMessage(leilaoId, store, { id, fallbackUsername, fallbackMessage, fallbackAmount }) {
  if (store.isAlreadyProcessed(id)) return;
  // Reserva o id JÁ aqui, antes de qualquer await. O fluxo abaixo espera a
  // busca de capa na RAWG (resolveParsedGame) pra jogo novo — sem marcar
  // logo de cara, um reenvio idêntico do mesmo webhook (retry do pix.gg)
  // chegando nesse meio tempo passaria pela checagem acima ainda vendo
  // "não processado" e contaria a mesma doação 2x. markProcessed grava só
  // em memória aqui (o applyContribution/logUnparsedEvent mais abaixo já
  // persistem no disco do jeito de sempre) — o que importa é fechar a
  // janela de corrida dentro do mesmo processo, não mudar o disco 2x.
  store.markProcessed(id);

  let username = fallbackUsername;
  let message = fallbackMessage;
  let amountCents = fallbackAmount;

  // Se não veio detalhe (fluxo normal do webhook do LivePix), busca na API
  if (message === undefined) {
    const details = await livepix.fetchMessage(id);
    username = details.username;
    message = details.message;
    amountCents = details.amount; // já vem em centavos
  }

  const isOpen = store.getState("open", "true") === "true";
  if (!isOpen) {
    store.logUnparsedEvent({ amountCents, username, rawMessage: message, livepixId: id });
    broadcastUpdate(leilaoId, store, { type: "closed", username, amount: centsToNumber(amountCents), message });
    return;
  }

  let parsed = parseMessage(message);
  if (!parsed) {
    store.logUnparsedEvent({ amountCents, username, rawMessage: message, livepixId: id });
    broadcastUpdate(leilaoId, store, {
      type: "ignored",
      username,
      amount: centsToNumber(amountCents),
      message,
    });
    return;
  }
  parsed = await resolveParsedGame(store, parsed);

  const needsImage = !store.hasGame(parsed.key) || !store.hasGameImage(parsed.key);

  const game = store.applyContribution({
    key: parsed.key,
    name: parsed.name,
    action: parsed.action,
    amountCents,
    username,
    rawMessage: message,
    livepixId: id,
  });
  if (parsed.action === "remove") store.setState("lastSabotagedKey", game.key);

  broadcastUpdate(leilaoId, store, {
    type: parsed.action,
    username,
    amount: centsToNumber(amountCents),
    message,
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
  });

  touchActivity(store);
  maybeFetchGameImage(leilaoId, store, game.key, game.name, needsImage);
}

// Monta a URL de webhook de um leilão a partir da própria requisição (não
// depende de nenhuma env var de URL pública, funciona igual local e em
// produção).
function buildWebhookUrlFromReq(req, leilaoId) {
  const publicUrl = `${req.protocol}://${req.get("host")}`;
  const secret = process.env.PIXGG_WEBHOOK_SECRET || "";
  return `${publicUrl}/webhook/pixgg/${leilaoId}?assinatura=${secret}`;
}

// ---------- login com a Twitch ----------

// Passo 1: manda o navegador pra tela de autorização da Twitch. GET (não
// fetch/POST) de propósito — é uma navegação de página inteira mesmo, e uma
// tela de consentimento cross-origin não tem como funcionar via XHR.
app.get("/auth/twitch/start", (req, res) => {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    return res.status(500).send("Login com a Twitch não está configurado nesse servidor.");
  }

  const state = crypto.randomBytes(32).toString("base64url");
  const returnTo = safeReturnTo(req.query.returnTo);

  try {
    session.setCookie(req, res, "leilao_oauth_state", { state, returnTo }, OAUTH_STATE_MAX_AGE_SECONDS);
  } catch (err) {
    console.error("Falha ao iniciar login com a Twitch:", err.message);
    return res.status(500).send("Não foi possível iniciar o login. Tente de novo.");
  }

  res.redirect(twitchAuth.buildAuthorizeUrl({ redirectUri: buildTwitchRedirectUri(req), state }));
});

// Passo 2: a Twitch redireciona de volta pra cá com ?code=...&state=...
// (ou ?error=... se a pessoa cancelou). Confirma o state (defesa contra
// CSRF), troca o code por um token de usuário, busca quem é de verdade, e
// grava isso numa sessão nossa.
app.get("/auth/twitch/callback", async (req, res) => {
  const statePayload = session.getCookie(req, "leilao_oauth_state");
  // Limpa JÁ, antes de qualquer outra checagem — torna esse cookie de uso
  // único, fechando tanto replay de CSRF quanto replay de uma URL de
  // callback (com code+state) que tenha vazado por algum motivo (histórico
  // do navegador, header Referer, log de proxy).
  session.clearCookie(req, res, "leilao_oauth_state");

  if (!statePayload) {
    return res.status(400).send("Sessão de login expirou. Volte e tente de novo.");
  }
  if (req.query.error) {
    // Cancelou na tela da Twitch — não é erro nosso, só volta de mãos vazias.
    return res.redirect(safeReturnTo(statePayload.returnTo));
  }
  if (!req.query.state || !timingSafeEqualString(req.query.state, statePayload.state)) {
    return res.status(400).send("Estado de login inválido. Tente de novo.");
  }
  if (!req.query.code) {
    return res.status(400).send("Código de autorização ausente.");
  }

  try {
    const redirectUri = buildTwitchRedirectUri(req);
    const accessToken = await twitchAuth.exchangeCodeForToken({ code: req.query.code, redirectUri });
    const user = await twitchAuth.fetchAuthenticatedUser(accessToken);
    // accessToken não é usado de novo depois daqui nem gravado em lugar
    // nenhum — mesmo que o SESSION_SECRET vaze um dia, isso deixa forjar
    // "sou o usuário X" dentro do NOSSO app, nunca agir como esse usuário
    // de verdade na API da Twitch.

    session.setCookie(req, res, "leilao_session", {
      twitchUserId: user.id,
      twitchLogin: user.login,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }, SESSION_MAX_AGE_SECONDS);

    res.redirect(safeReturnTo(statePayload.returnTo));
  } catch (err) {
    console.error("Erro no login com a Twitch:", err.message);
    res.status(502).send("Não foi possível confirmar seu login com a Twitch. Tente de novo.");
  }
});

app.post("/api/session/logout", (req, res) => {
  session.clearCookie(req, res, "leilao_session");
  res.json({ ok: true });
});

// httpOnly esconde o cookie do JS do navegador de propósito (é o que
// impede um XSS de roubar a sessão) — por isso o front-end precisa
// perguntar pro servidor quem está logado, em vez de ler o cookie direto.
app.get("/api/session/me", (req, res) => {
  const s = getTwitchSession(req);
  res.json(s
    ? { loggedIn: true, twitchUserId: s.twitchUserId, twitchLogin: s.twitchLogin, displayName: s.displayName, avatarUrl: s.avatarUrl }
    : { loggedIn: false });
});

app.get("/api/meus-leiloes", (req, res) => {
  const twitchSession = getTwitchSession(req);
  if (!twitchSession) return res.status(401).json({ error: "Faça login com a Twitch" });

  const rows = registry.listLeiloesByOwner(twitchSession.twitchUserId)
    .map((meta) => {
      const store = getStore(meta.id);
      return {
        id: meta.id,
        title: store.getState("title", meta.title || "Leilão de Jogos"),
        url: `/l/${meta.id}`,
        createdAt: meta.createdAt,
        hostVerified: getHostVerified(store),
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ leiloes: rows });
});

app.get("/meus-leiloes", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "meus-leiloes.html"));
});

// ---------- criação de leilão ----------

app.post("/api/leiloes", async (req, res) => {
  try {
    const twitchSession = getTwitchSession(req);
    if (!twitchSession) {
      return res.status(401).json({ error: "Faça login com a Twitch antes de criar o leilão" });
    }

    const { title, password, clientId, clientSecret } = req.body || {};
    const { id } = await registry.createLeilao({
      title,
      host: twitchSession.displayName,
      hostAvatar: twitchSession.avatarUrl,
      hostTwitchUserId: twitchSession.twitchUserId,
      hostTwitchLogin: twitchSession.twitchLogin,
      password,
      clientId,
      clientSecret,
      buildWebhookUrl: (leilaoId) => buildWebhookUrlFromReq(req, leilaoId),
    });
    res.json({ ok: true, id, url: `/l/${id}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ranking público de streamers por total arrecadado — histórico completo
// (soma todos os rounds já arquivados via archiveAuction, ver src/db.js).
// Cross-tenant de propósito: é a única rota que olha todos os leilões de
// uma vez, pra mostrar no board.
//
// Não dá pra só somar archivedTotal + totalRaised ao vivo direto: desde que
// encerrar passou a arquivar sozinho (openRound: true, ver archiveAuction),
// o snapshot mais recente já pode refletir boa parte (ou tudo) do total ao
// vivo atual, e somar os dois contaria esse pedaço 2x. Também não dá pra só
// ignorar o total ao vivo quando fechado (tentativa anterior, com bug real):
// leilões fechados de antes dessa feature existir (sem nenhum pastAuctions
// ainda) sumiam do ranking inteiro, mesmo já tendo arrecadado de verdade.
//
// A conta certa: se o snapshot mais recente é um round "aberto" (ainda não
// finalizado por um zerar), ele já é a MELHOR estimativa do que já foi
// contado dali — só soma a diferença (getTotalRaised ao vivo menos esse
// snapshot), que é o que rolou de novo desde então (ex: reabriu e voltou a
// receber doação sem fechar de novo ainda). Sem esse snapshot (nunca
// arquivado, ou já finalizado por um zerar — round novo começando do zero),
// o total ao vivo inteiro ainda não foi contado em lugar nenhum.
// Agrupa por dono verificado da Twitch (meta.ownerTwitchUserId) -- sem isso,
// um streamer com vários leilões (ex: um por live) aparecia como várias
// linhas separadas disputando com ele mesmo, em vez de uma soma só. Leilão
// sem dono (criado antes do login com a Twitch existir, ownerTwitchUserId
// ausente) não tem chave confiável pra agrupar com nada -- fica sozinho na
// própria linha, usando o id como chave única (nunca bate com outro leilão),
// igual já era o comportamento de antes pra esses.
// Soma o arquivado (rounds já zerados) com o que sobrou do round aberto que
// ainda não foi refletido no arquivo -- extraído do que já era o cálculo de
// /api/ranking porque o novo /api/ranking/:twitchUserId (detalhe de um
// streamer, ver ranking clicável em app.js) precisa do mesmo número por
// leilão individual, não só do agregado.
function computeLeilaoTotalRaised(store) {
  const pastAuctions = store.getPastAuctions();
  const archivedTotal = pastAuctions.reduce((sum, a) => sum + (a.totalRaised || 0), 0);
  const alreadyReflected = pastAuctions[0] && pastAuctions[0].openRound ? (pastAuctions[0].totalRaised || 0) : 0;
  const liveTotal = centsToNumber(store.getTotalRaised());
  return archivedTotal + Math.max(0, liveTotal - alreadyReflected);
}

app.get("/api/ranking", (req, res) => {
  const perLeilao = registry
    .listLeilaoIds()
    .filter((id) => !getHideTotalRaised(getStore(id))) // quem oculta o total não participa do ranking
    .map((id) => {
      const meta = registry.getLeilaoMeta(id) || {};
      const store = getStore(id);
      return {
        id,
        ownerTwitchUserId: meta.ownerTwitchUserId || null,
        host: store.getState("host", meta.host || ""),
        hostAvatar: store.getState("hostAvatar", null),
        hostVerified: getHostVerified(store),
        totalRaised: computeLeilaoTotalRaised(store),
        createdAt: meta.createdAt || "",
      };
    })
    .filter((row) => row.host && row.totalRaised > 0);

  const groups = new Map();
  for (const row of perLeilao) {
    const groupKey = row.ownerTwitchUserId || `leilao:${row.id}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { ...row, totalRaised: 0 });
    const group = groups.get(groupKey);
    group.totalRaised += row.totalRaised;
    // Nome/foto/verificação exibidos vêm do leilão mais recente do grupo --
    // mais provável de estar com o nome atual do streamer.
    if (row.createdAt > group.createdAt) {
      group.id = row.id;
      group.host = row.host;
      group.hostAvatar = row.hostAvatar;
      group.hostVerified = row.hostVerified;
      group.createdAt = row.createdAt;
    }
  }

  const rows = [...groups.values()]
    .sort((a, b) => b.totalRaised - a.totalRaised)
    .slice(0, 50)
    .map((row, index) => ({
      id: row.id,
      ownerTwitchUserId: row.ownerTwitchUserId,
      host: row.host,
      hostAvatar: row.hostAvatar,
      hostVerified: row.hostVerified,
      totalRaised: row.totalRaised,
      rank: index + 1,
    }));
  res.json({ ranking: rows });
});

// Ranking dos leilões de UM streamer contra ele mesmo -- não mais
// cross-streamer (o cliente decidiu não expor/comparar arrecadação entre
// streamers diferentes, só ranquear os próprios leilões um contra o
// outro). Usado pelo botão "Ranking" do board (ver GET /api/l/:id/ranking
// logo abaixo, que resolve o twitchUserId do dono e chama isso).
function computeOwnerRanking(twitchUserId) {
  if (!twitchUserId) return [];
  return registry
    .listLeiloesByOwner(twitchUserId)
    .map((meta) => {
      const store = getStore(meta.id);
      if (getHideTotalRaised(store)) return null;
      return {
        id: meta.id,
        title: store.getState("title", meta.title || "Leilão de Jogos"),
        totalRaised: computeLeilaoTotalRaised(store),
        createdAt: meta.createdAt || "",
      };
    })
    .filter((row) => row && row.totalRaised > 0)
    .sort((a, b) => b.totalRaised - a.totalRaised)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

// Leilão-scoped pra não precisar expor o twitchUserId (identificador
// interno) pro cliente -- resolve o dono a partir do :id, igual
// check-session logo acima. Sem dono verificado (leilão antigo, criado
// antes do login com Twitch existir), não tem como agrupar nada -- volta
// ranking vazio em vez de tentar adivinhar.
app.get("/api/l/:id/ranking", loadLeilao, (req, res) => {
  const meta = registry.getLeilaoMeta(req.leilaoId);
  res.json({ ranking: computeOwnerRanking(meta && meta.ownerTwitchUserId) });
});

// Capas populares pro fundo decorativo do board (mosaico estilo tela de
// login da Steam) -- não é dado de nenhum leilão específico, então sem
// exigir :id nem auth. fetchPopularCovers já cacheia/degrada sozinho (lista
// vazia se faltar RAWG_API_KEY); o board cai pro fundo antigo nesse caso.
app.get("/api/board-bg-covers", async (req, res) => {
  const covers = await fetchPopularCovers();
  res.set("Cache-Control", "public, max-age=1800"); // 30min: navegador/proxy evitam repetir a mesma lista o tempo todo
  res.json({ covers });
});

// Apaga um leilão inteiro (registro + arquivo de dados) — moderação/limpeza
// de leilões de teste, sem precisar saber a senha de apresentador de cada
// um. Diferente da senha por leilão: exige um segredo do DONO do site
// (SUPER_ADMIN_SECRET no .env). Sem essa variável configurada, a rota
// nega sempre — "em branco = pula validação" (como o PIXGG_WEBHOOK_SECRET
// faz) seria perigoso demais pra uma ação destrutiva e irreversível.
app.delete("/api/admin/leiloes/:id", (req, res) => {
  const secret = process.env.SUPER_ADMIN_SECRET || "";
  const supplied = req.header("x-super-admin-secret") || "";
  if (!secret || !timingSafeEqualString(supplied, secret)) {
    return res.status(401).json({ error: "Segredo de super-admin inválido ou não configurado" });
  }
  const { id } = req.params;
  if (!registry.leilaoExists(id)) {
    return res.status(404).json({ error: "Leilão não encontrado" });
  }
  registry.deleteLeilao(id); // primeiro: nenhuma rota nova pode mais achar esse id
  deleteStore(id); // depois: tira do cache e apaga o arquivo
  deleteUploadedBackgroundsFor(id); // e qualquer imagem de fundo enviada por upload desse leilão
  res.json({ ok: true, id });
});

// ---------- board e painel por leilão ----------

app.get("/l/:id", (req, res) => {
  if (!registry.leilaoExists(req.params.id)) return res.status(404).send("Leilão não encontrado");
  res.set("Referrer-Policy", "no-referrer");
  res.sendFile(path.join(__dirname, "public", "board.html"));
});

app.get("/l/:id/admin", (req, res) => {
  if (!registry.leilaoExists(req.params.id)) return res.status(404).send("Leilão não encontrado");
  res.set("Referrer-Policy", "no-referrer");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ---------- rotas públicas (id-scoped) ----------

app.get("/api/l/:id/leaderboard", loadLeilao, (req, res) => {
  res.json(serializeLeaderboard(req.store, req.leilaoId));
});

app.get("/api/l/:id/recap", loadLeilao, (req, res) => {
  res.json(buildRecap(req.store));
});

// Histórico de rounds já zerados (ver archiveAuction, chamado em
// POST /admin/reset). Pública como o /recap normal — mesmo tipo de dado
// que já era visível ao vivo quando o round estava rolando, não expõe
// nada novo por trás de senha.
app.get("/api/l/:id/recap/history", loadLeilao, (req, res) => {
  res.json({ history: req.store.getPastAuctions() });
});

app.get("/api/l/:id/events/recent", loadLeilao, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const events = req.store.getRecentEvents(limit).map((e) => ({
    ...e,
    amount: centsToNumber(e.amount_cents),
  }));
  res.json({ events });
});

// Webhook do LivePix — mantido só como referência (ver CLAUDE.md), a
// integração real hoje é a do pix.gg logo abaixo. Não tem streamerUsername
// pra rotear pra um leilão específico, então no modelo multi-tenant essa
// rota fica só confirmando recebimento sem fazer nada — não desativamos de
// vez até decidir se vale ressuscitar pra algum caso de uso.
app.post("/webhook/livepix", (req, res) => {
  res.sendStatus(200);
});

// O pix.gg faz um "ping" periódico com GET nessa URL pra confirmar que ela
// está de pé (descoberto em 2026-07-10 pelos logs de produção — a doc deles
// não menciona isso). Sem responder 200 aqui, o pix.gg parece considerar o
// endpoint quebrado e não manda o POST de verdade da doação.
//
// IMPORTANTE: essa rota sempre respondia só "OK" pra qualquer GET, mesmo
// sem o ?assinatura= — isso é uma armadilha real: se alguém copia uma URL
// incompleta (ex: cortada, sem a assinatura) e testa no navegador, vê "OK"
// e acha que está tudo certo, enquanto o POST de doação de verdade (que
// SIM exige assinatura) seria recusado em silêncio. Agora o texto da
// resposta avisa isso, mesmo mantendo status 200 (não quebra o ping
// automático do pix.gg, que só olha o status).
app.get("/webhook/pixgg/:leilaoId", (req, res) => {
  const leilaoId = req.params.leilaoId;
  if (!/^[a-z0-9_-]+$/i.test(leilaoId) || !registry.leilaoExists(leilaoId)) {
    return res.status(200).send("OK — mas esse leilão não existe. Essa URL parece incompleta ou errada.");
  }

  const secret = process.env.PIXGG_WEBHOOK_SECRET || "";
  const signatureOk = pixgg.verifySignature(req.query.assinatura, secret);
  const store = getStore(leilaoId);
  touchWebhookPing(store); // a URL bateu certo no leilão, isso já prova que o host/id estão certos

  if (!signatureOk) {
    // Não mexe em webhookSignatureBroken aqui (só o POST de verdade decide
    // isso) — não dá pra confiar que o GET de ping do pix.gg sempre carrega
    // a assinatura, então um GET sem ela não é necessariamente um problema.
    return res.status(200).send(
      "OK — só que o parâmetro ?assinatura= dessa URL está ausente ou errado. " +
      "As doações de verdade seriam recusadas até isso ser corrigido. " +
      "Revincule o webhook pelo painel avançado do leilão pra gerar a URL completa de novo."
    );
  }

  res.status(200).send("OK — webhook desse leilão configurado corretamente.");
});

// Webhook do pix.gg — uma URL própria por leilão (vinculada automaticamente
// na aplicação do streamer no momento da criação, ver registry.createLeilao
// + pixggApi.setWebhookUrl). O :leilaoId na própria URL já diz de quem é a
// doação — não precisa mais casar por streamerUsername no corpo.
app.post("/webhook/pixgg/:leilaoId", (req, res) => {
  res.sendStatus(200); // confirma recebimento primeiro

  // Log de cada etapa de propósito -- achado real em produção (2026-07-21):
  // uma doação real chegou ao pix.gg (confirmada no painel deles) mas não
  // deixou rastro nenhum aqui, nem como evento "ignorado". Sem log em cada
  // decisão, não dá pra saber se o POST nem chegou no servidor, chegou com
  // assinatura errada, ou chegou como "created" (não pago) -- os três casos
  // ficam idênticos do lado de fora. Prefixo "[webhook pix.gg]" pra filtrar
  // fácil no log do Railway.
  const leilaoId = req.params.leilaoId;
  console.log(`[webhook pix.gg] POST recebido -- leilaoId="${leilaoId}" assinatura=${req.query.assinatura ? "presente" : "ausente"}`);

  try {
    if (!/^[a-z0-9_-]+$/i.test(leilaoId) || !registry.leilaoExists(leilaoId)) {
      console.warn(`[webhook pix.gg] leilão "${leilaoId}" não encontrado, ignorando.`);
      return;
    }
    const store = getStore(leilaoId);

    const secret = process.env.PIXGG_WEBHOOK_SECRET || "";
    if (!pixgg.verifySignature(req.query.assinatura, secret)) {
      console.warn(`[webhook pix.gg] assinatura inválida pra leilaoId="${leilaoId}", ignorado.`);
      store.setState("webhookSignatureBroken", "true");
      return;
    }
    store.setState("webhookSignatureBroken", "false");
    touchWebhookPing(store);

    const donation = pixgg.parseDonation(req.body);
    console.log(`[webhook pix.gg] assinatura ok -- id=${donation.id} status="${donation.status}" username="${donation.username}" mensagem="${donation.message}" valor=${donation.amountCents}`);
    if (!pixgg.isPaid(donation.status)) {
      console.log(`[webhook pix.gg] status "${donation.status}" não é "paid", ignorando por enquanto (espera o próximo webhook dessa mesma transação).`);
      return;
    }

    processDonationMessage(leilaoId, store, {
      id: donation.id,
      fallbackUsername: donation.username,
      fallbackMessage: donation.message,
      fallbackAmount: donation.amountCents,
    });
  } catch (err) {
    console.error(`[webhook pix.gg] erro ao processar (leilaoId="${leilaoId}"):`, err.message);
  }
});

// ---------- rotas de admin (id-scoped) ----------

app.post("/api/l/:id/admin/login", loadLeilao, (req, res) => {
  const { password } = req.body || {};
  const hash = req.store.getState("adminSecretHash");
  if (!verifyPassword(password, hash)) {
    return res.status(401).json({ error: "Senha incorreta" });
  }
  res.json({ ok: true });
});

// Deixa o board pular o modal de senha pra quem já é o dono verificado da
// Twitch (mesmo critério de requireLeilaoAdmin, ver lá) -- chamado na carga
// da página e ao clicar em "modo apresentador". Não expõe nada sensível
// (só um booleano), então não precisa passar por requireLeilaoAdmin.
app.get("/api/l/:id/admin/check-session", loadLeilao, (req, res) => {
  const session = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  const isOwner = !!(session && meta && meta.ownerTwitchUserId && session.twitchUserId === meta.ownerTwitchUserId);
  res.json({ isOwner });
});

app.get("/api/l/:id/admin/game-search", loadLeilao, requireLeilaoAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  const results = await searchGames(q);
  res.json({ results });
});

app.post("/api/l/:id/admin/manual-entry", loadLeilao, requireLeilaoAdmin, async (req, res) => {
  const { name, amount, action, username } = req.body || {};
  if (!name || !amount || Number.isNaN(Number(amount))) {
    return res.status(400).json({ error: "Informe name e amount" });
  }
  const { leilaoId, store } = req;
  let parsed = parseMessage(`${action === "remove" ? "-" : "+"}${name}`);
  if (!parsed) return res.status(400).json({ error: "Nome de jogo inválido" });
  parsed = await resolveParsedGame(store, parsed);

  const needsImage = !store.hasGame(parsed.key) || !store.hasGameImage(parsed.key);

  const game = store.applyContribution({
    key: parsed.key,
    name: parsed.name,
    action: parsed.action,
    amountCents: Math.round(Number(amount) * 100),
    username: username || "admin (manual)",
    rawMessage: `[lançamento manual] ${name}`,
    livepixId: null,
  });
  if (parsed.action === "remove") store.setState("lastSabotagedKey", game.key);

  broadcastUpdate(leilaoId, store, {
    type: parsed.action,
    username: username || "admin",
    amount: Number(amount),
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
  });

  // touchActivity SEM reopen=true: um lançamento manual (ex: doação recebida
  // fora do app, ou teste do sistema) não deve reabrir um leilão encerrado
  // sozinho — mesma regra do webhook real (ver isOpen check acima em
  // processDonationMessage), documentada no CLAUDE.md ("não reabre sozinho
  // com uma doação nova"). Antes usava reopen=true e reabria sem avisar,
  // isso que o cliente percebeu como "o timer tá com um problema".
  touchActivity(store);
  maybeFetchGameImage(leilaoId, store, game.key, game.name, needsImage);
  res.json({ ok: true, game });
});

app.post("/api/l/:id/admin/adjust", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { key, deltaAmount } = req.body || {};
  const game = req.store.adjustGame(key, Math.round(Number(deltaAmount) * 100));
  if (!game) return res.status(404).json({ error: "Jogo não encontrado" });
  broadcastUpdate(req.leilaoId, req.store, { type: "adjust", game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) } });
  res.json({ ok: true, game });
});

app.post("/api/l/:id/admin/set-total", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { key, total } = req.body || {};
  const game = req.store.setGameTotal(key, Math.round(Number(total) * 100));
  if (!game) return res.status(404).json({ error: "Jogo não encontrado" });
  broadcastUpdate(req.leilaoId, req.store, { type: "adjust", game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) } });
  res.json({ ok: true, game });
});

app.post("/api/l/:id/admin/rename", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { key, newName } = req.body || {};
  const game = req.store.renameGame(key, newName);
  broadcastUpdate(req.leilaoId, req.store, { type: "rename" });
  res.json({ ok: true, game });
});

app.post("/api/l/:id/admin/merge", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { fromKey, toKey, useNameFrom } = req.body || {};
  const game = req.store.mergeGames(fromKey, toKey, !!useNameFrom);
  if (!game) return res.status(404).json({ error: "Jogo(s) não encontrado(s)" });
  broadcastUpdate(req.leilaoId, req.store, { type: "merge" });
  res.json({ ok: true, game });
});

app.post("/api/l/:id/admin/add-game", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { name } = req.body || {};
  const parsed = parseMessage(`+${name}`);
  if (!parsed) return res.status(400).json({ error: "Nome inválido" });
  const wasNew = !req.store.hasGame(parsed.key);
  const game = req.store.addManualGame(parsed.name, parsed.key, 0);
  broadcastUpdate(req.leilaoId, req.store, { type: "manual" });
  maybeFetchGameImage(req.leilaoId, req.store, game.key, game.name, wasNew);
  res.json({ ok: true, game });
});

app.delete("/api/l/:id/admin/game/:key", loadLeilao, requireLeilaoAdmin, (req, res) => {
  req.store.deleteGame(req.params.key);
  broadcastUpdate(req.leilaoId, req.store, { type: "delete" });
  res.json({ ok: true });
});

app.post("/api/l/:id/admin/reset", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { store, leilaoId } = req;
  // Arquiva o recap do round atual antes de apagar — só se teve algum lote
  // de verdade, pra não poluir o histórico com resets de leilão vazio
  // (testes, ou zerar duas vezes seguidas sem nada rolar no meio).
  const recap = buildRecap(store);
  if (recap.totalGames > 0) store.archiveAuction(recap, { openRound: false });
  store.resetAll();
  broadcastUpdate(leilaoId, store, { type: "reset" });
  res.json({ ok: true });
});

app.post("/api/l/:id/admin/toggle-open", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { open } = req.body || {};
  const { store, leilaoId } = req;
  store.setState("open", open ? "true" : "false");
  if (open) {
    touchActivity(store, true); // reabrir dá um fôlego novo (e reseta a referência do aviso de webhook, ver isWebhookStale)
  } else {
    store.setState("paused", "false"); // encerrar limpa qualquer pausa pendente
    captureAuctionDuration(store); // precisa rodar antes do snapshot: buildRecap lê lastAuctionDurationMs
    archiveOpenRoundSnapshot(store);
  }
  broadcastUpdate(leilaoId, store, { type: "toggle-open", open: !!open });
  res.json({ ok: true, open: !!open });
});

// Pausa/retoma só o timer de inatividade (o leilão continua aberto e
// aceitando doações normalmente) — diferente de encerrar, que é definitivo
// até reabrir manual. Ao retomar, volta exatamente com o tempo que faltava.
app.post("/api/l/:id/admin/pause", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { paused } = req.body || {};
  const { store, leilaoId } = req;
  const isOpen = store.getState("open", "true") === "true";
  if (!isOpen) return res.status(400).json({ error: "O leilão está encerrado, não dá pra pausar" });

  const autoCloseMs = getAutoCloseMs(store);
  if (paused) {
    const lastActivityAt = Number(store.getState("lastActivityAt", Date.now()));
    const remaining = Math.max(0, lastActivityAt + autoCloseMs - Date.now());
    store.setState("pausedRemainingMs", Math.round(remaining));
    store.setState("paused", "true");
  } else {
    const remaining = Number(store.getState("pausedRemainingMs", autoCloseMs));
    store.setState("lastActivityAt", String(Date.now() - (autoCloseMs - remaining)));
    store.setState("paused", "false");
  }
  broadcastUpdate(leilaoId, store, { type: "pause", paused: !!paused });
  res.json({ ok: true, paused: !!paused });
});

// Soma 5 minutos ao que já falta (ou ao pausado) -- antes usava
// touchActivity, que reseta lastActivityAt pra AGORA, ou seja, sempre
// voltava pra duração base (5min) em vez de somar: com 4:30 sobrando, "+5"
// virava 5:00 (só +30s na prática). Rótulo promete soma, então soma de
// verdade agora, não importa quanto já tinha passado.
app.post("/api/l/:id/admin/reset-timer", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { store, leilaoId } = req;
  const isOpen = store.getState("open", "true") === "true";
  if (!isOpen) return res.status(400).json({ error: "O leilão está encerrado" });

  const EXTEND_MS = 5 * 60 * 1000;
  const isPaused = store.getState("paused", "false") === "true";
  if (isPaused) {
    const remaining = Number(store.getState("pausedRemainingMs", getAutoCloseMs(store)));
    store.setState("pausedRemainingMs", Math.round(remaining + EXTEND_MS));
  } else {
    const lastActivityAt = Number(store.getState("lastActivityAt", Date.now()));
    store.setState("lastActivityAt", String(lastActivityAt + EXTEND_MS));
  }
  broadcastUpdate(leilaoId, store, { type: "timer-reset" });
  res.json({ ok: true });
});

// Deixa o streamer escolher quantos minutos sem atividade encerram o leilão
// (padrão 5). Já reinicia a contagem do zero com a duração nova.
app.post("/api/l/:id/admin/set-timer", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const minutes = Number(req.body && req.body.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 180) {
    return res.status(400).json({ error: "Informe um número de minutos entre 1 e 180" });
  }
  const { store, leilaoId } = req;
  store.setState("timerDurationMs", Math.round(minutes * 60 * 1000));
  touchActivity(store, true);
  broadcastUpdate(leilaoId, store, { type: "timer-reset" });
  res.json({ ok: true, minutes });
});

app.post("/api/l/:id/admin/title", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { title } = req.body || {};
  req.store.setState("title", title || "Leilão de Jogos");
  broadcastUpdate(req.leilaoId, req.store, { type: "title" });
  res.json({ ok: true });
});

const AVAILABLE_THEMES = ["nebulosa", "recife", "ametista", "safira", "grafite"];

app.post("/api/l/:id/admin/theme", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { theme } = req.body || {};
  if (!AVAILABLE_THEMES.includes(theme)) {
    return res.status(400).json({ error: "Tema inválido" });
  }
  req.store.setState("theme", theme);
  broadcastUpdate(req.leilaoId, req.store, { type: "theme" });
  res.json({ ok: true });
});

// Quantos lotes contam como "classificados" (ver getQualifyCount) — nem
// todo streamer joga só 3 jogos por live, então isso não pode ficar fixo.
app.post("/api/l/:id/admin/qualify-count", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const count = Number(req.body && req.body.count);
  if (!Number.isFinite(count) || count < 1 || count > 20) {
    return res.status(400).json({ error: "Informe um número entre 1 e 20" });
  }
  req.store.setState("qualifyCount", Math.floor(count));
  broadcastUpdate(req.leilaoId, req.store, { type: "qualify-count" });
  res.json({ ok: true, count: Math.floor(count) });
});

// Oculta/revela o total arrecadado do público (ver getHideTotalRaised) —
// nem todo streamer quer expor quanto ganhou. Enquanto ligado, esse leilão
// também some do ranking global de streamers (ver /api/ranking).
app.post("/api/l/:id/admin/hide-total", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const hidden = !!(req.body && req.body.hidden);
  req.store.setState("hideTotalRaised", hidden ? "true" : "false");
  broadcastUpdate(req.leilaoId, req.store, { type: "hide-total" });
  res.json({ ok: true, hidden });
});

// Upload de arquivo de imagem pra usar de fundo — alternativa a colar uma
// URL (rota abaixo). multer.single() é chamado manualmente (não como
// middleware direto na rota) pra poder responder erro em JSON como todo o
// resto da API, em vez de cair no handler de erro genérico (HTML) do
// Express quando o fileFilter rejeita o arquivo.
app.post("/api/l/:id/admin/background-image-upload", loadLeilao, requireLeilaoAdmin, (req, res) => {
  backgroundImageUpload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada" });
    const url = `/uploads/${req.file.filename}`;
    deleteOldUploadedBackground(req.store);
    req.store.setState("backgroundImageUrl", url);
    broadcastUpdate(req.leilaoId, req.store, { type: "background-image" });
    res.json({ ok: true, url });
  });
});

// Imagem de fundo custom do board por URL — alternativa ao upload acima,
// pra quem já tem a imagem publicada em algum lugar (Imgur, etc). Valida só
// o protocolo pra evitar um valor tipo "javascript:" acabar num
// background-image inline no app.js.
app.post("/api/l/:id/admin/background-image", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const raw = (req.body?.url || "").trim();
  if (!raw) {
    deleteOldUploadedBackground(req.store);
    req.store.setState("backgroundImageUrl", null);
    broadcastUpdate(req.leilaoId, req.store, { type: "background-image" });
    return res.json({ ok: true });
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return res.status(400).json({ error: "URL inválida" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.status(400).json({ error: "A URL precisa começar com http:// ou https://" });
  }
  deleteOldUploadedBackground(req.store);
  req.store.setState("backgroundImageUrl", parsed.href);
  broadcastUpdate(req.leilaoId, req.store, { type: "background-image" });
  res.json({ ok: true });
});

// Revincula o webhook do leilão já existente na aplicação do pix.gg — pra
// quando o link se perde (ex: o streamer regenerou o clientSecret, o que
// limpa o campo "Webhook URL" do lado do pix.gg). Não recria o leilão, só
// refaz a chamada de vínculo com um client id/secret atuais.
app.post("/api/l/:id/admin/relink-webhook", loadLeilao, requireLeilaoAdmin, async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body || {};
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: "Informe o Client ID e o Client Secret do pix.gg" });
    }
    const confirmed = await pixggApi.setWebhookUrl(clientId, clientSecret, buildWebhookUrlFromReq(req, req.leilaoId));
    res.json({ ok: true, webhookUrl: pixggApi.redactWebhookUrl(confirmed.webhookUrl) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- estáticos ----------
// Depois das rotas de página (/, /l/:id, /l/:id/admin) pra elas terem
// prioridade; os arquivos de public/ (css, js, board.html, admin.html
// direto) continuam acessíveis por trás.
app.use(express.static(path.join(__dirname, "public")));

// Imagens de fundo enviadas por upload (ver background-image-upload acima)
// — servidas do mesmo DATA_DIR persistente, não de public/ (que não
// sobrevive a um novo deploy).
app.use("/uploads", express.static(UPLOADS_DIR));

// ---------- socket.io ----------

io.on("connection", (socket) => {
  const leilaoId = socket.handshake.query.leilaoId;
  if (!leilaoId || !registry.leilaoExists(leilaoId)) return;
  socket.join(leilaoId);
  socket.emit("update", { leaderboard: serializeLeaderboard(getStore(leilaoId), leilaoId), lastEvent: null });
});

// Confere a cada 5s, em todo leilão cadastrado, se passou o tempo sem
// atividade e encerra sozinho. Uma vez fechado, fica fechado até o
// streamer reabrir manualmente (não reabre sozinho com uma doação nova).
setInterval(() => {
  for (const leilaoId of registry.listLeilaoIds()) {
    const store = getStore(leilaoId);
    const isOpen = store.getState("open", "true") === "true";
    if (!isOpen) continue;
    if (store.getState("paused", "false") === "true") continue; // pausado não conta o tempo
    const lastActivityAt = Number(store.getState("lastActivityAt", Date.now()));
    if (Date.now() - lastActivityAt >= getAutoCloseMs(store)) {
      store.setState("open", "false");
      captureAuctionDuration(store);
      archiveOpenRoundSnapshot(store);
      broadcastUpdate(leilaoId, store, { type: "auto-closed" });
    }
  }
}, 5000);

// ---------- start ----------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Leilão rodando em http://localhost:${PORT}`);
  console.log(`Criar um leilão em http://localhost:${PORT}/`);
});
