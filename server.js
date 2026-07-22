require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");

const registry = require("./src/registry");
const { getStore, deleteStore, DATA_DIR } = require("./src/stores");
const { verifyPassword, timingSafeEqualString } = require("./src/passwords");
const { parseMessage, normalizeKey, leftoverAfterMatch, looksLikeNoise } = require("./src/parser");
const { fetchGameImage, searchGames, identifyGameFromNoisyText, fetchPopularCovers } = require("./src/gameImages");
const { fetchTwitchAvatar } = require("./src/twitchClient");
const twitchAuth = require("./src/twitchAuth");
const session = require("./src/session");
const mpAuth = require("./src/mpAuth");
const mpApi = require("./src/mpApi");
const mpWebhook = require("./src/mpWebhook");
const streamersStore = require("./src/streamersStore");
const paymentsStore = require("./src/paymentsStore");

const app = express();
// Railway termina TLS na borda; sem confiar no proxy (X-Forwarded-Proto),
// req.protocol sempre volta "http" mesmo em produção.
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Salvo no mesmo DATA_DIR persistente dos dados dos leilões, não em disco
// efêmero do container. Nome prefixado com leilaoId + horário pra não
// colidir entre leilões nem ficar em cache velho do navegador.
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

// Apaga o upload anterior se a imagem de fundo atual veio de /uploads/
// (URL externa como Imgur não tem arquivo nosso pra apagar, é no-op).
// Best-effort: erro ao apagar só loga, não impede a troca da imagem nova.
function deleteOldUploadedBackground(store) {
  const current = store.getState("backgroundImageUrl");
  if (!current || !current.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(current));
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") console.error("Falha ao apagar imagem de fundo antiga:", err.message);
  });
}

// Chamado ao apagar o leilão inteiro (deleteStore só remove o JSON de
// dados, não uploads). Varre por prefixo em vez de confiar só no
// backgroundImageUrl guardado, pra também limpar arquivos órfãos.
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

function getAutoCloseMs(store) {
  const stored = Number(store.getState("timerDurationMs", DEFAULT_AUTO_CLOSE_MS));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_AUTO_CLOSE_MS;
}

const DEFAULT_QUALIFY_COUNT = 3;

// Quantos lotes contam como "classificados" (linha de corte no catálogo,
// ver .qualify-divider em app.js) — configurável por leilão.
function getQualifyCount(store) {
  const stored = Number(store.getState("qualifyCount", DEFAULT_QUALIFY_COUNT));
  return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : DEFAULT_QUALIFY_COUNT;
}

// Nem todo streamer quer expor quanto arrecadou pro público. Quando
// ligado, o total agregado (topbar + recap) vira null na API pública
// (não só escondido via CSS — o valor real não fica na resposta). Os
// valores de CADA lote continuam aparecendo normalmente.
function getHideTotalRaised(store) {
  return store.getState("hideTotalRaised", "false") === "true";
}

// Verdadeiro quando host/hostAvatar vieram do login de verdade com a
// Twitch na criação (ver POST /api/leiloes) -- não editável depois. Só
// falso pra leilão criado antes desse login existir.
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

// Mesma disciplina de allowlist EXATA de safeReturnTo, mas conectar o
// Mercado Pago também pode acontecer de dentro do board de um leilão
// específico — precisa voltar pra /l/<id>, não só pras páginas estáticas.
// Âncoras ^ e $ garantem que só bate exatamente esse formato.
const LEILAO_RETURN_PATH_RE = /^\/l\/[a-z0-9_-]+$/i;
function safeReturnToMp(value) {
  if (value === "/" || value === "/meus-leiloes") return value;
  if (typeof value === "string" && LEILAO_RETURN_PATH_RE.test(value)) return value;
  return "/";
}

function buildMpRedirectUri(req) {
  return `${req.protocol}://${req.get("host")}/auth/mercadopago/callback`;
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
// "agora" como início dessa sessão aberta.
function touchActivity(store, reopen = false) {
  store.setState("lastActivityAt", String(Date.now()));
  if (reopen) {
    store.setState("open", "true");
    store.setState("leilaoOpenedAt", String(Date.now()));
  }
}

// Guarda a duração no momento de fechar (não só na hora de exibir o
// recap), pra ficar estável mesmo com reconexão/reload depois.
function captureAuctionDuration(store) {
  const openedAt = Number(store.getState("leilaoOpenedAt", 0));
  if (openedAt > 0) {
    store.setState("lastAuctionDurationMs", String(Date.now() - openedAt));
  }
}

// Chamada nos dois pontos onde o leilão fecha (toggle manual e auto-close):
// encerrar já conta no histórico/ranking, sem precisar zerar depois. Ver
// openRound em src/db.js#archiveAuction pra evitar contar 2x se reabrir.
function archiveOpenRoundSnapshot(store) {
  const recap = buildRecap(store);
  if (recap.totalGames > 0) store.archiveAuction(recap, { openRound: true });
}

// Flag síncrona no state JSON de cada leilão do streamer (via
// registry.listLeiloesByOwner), atualizada por CONTA já que a conexão MP
// é por streamer, não por leilão. Guardar no JSON (em vez de consultar
// Postgres dentro de serializeLeaderboard) mantém essa função síncrona.
// Chamado com true num 401 real da API do MP, false ao reconectar.
function setLeiloesMpDisconnected(twitchUserId, disconnected) {
  for (const { id } of registry.listLeiloesByOwner(twitchUserId)) {
    const store = getStore(id);
    store.setState("mpDisconnected", disconnected ? "true" : "false");
    broadcastUpdate(id, store, null);
  }
}

// Melhor esforço pra achar a foto de perfil de um doador na Twitch, usando
// o nome digitado na doação como login (funciona quando bate, some
// silenciosamente quando não). Cache global (login é global, não por
// leilão). Nunca bloqueia a resposta: devolve null se ainda não tem no
// cache, mas quem chamou pode passar onResolved pra receber um broadcast
// assim que a busca terminar. donorAvatarFetching usa Set pra não chamar
// o mesmo callback 2x se dois lotes pedirem o mesmo doador de uma vez.
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
// existente no catálogo (ver resolveExistingKey em db.js). Sem match (é a
// primeira menção desse jogo), tenta extrair o nome limpo via RAWG antes
// de aceitar o texto inteiro como nome do lote.
async function resolveParsedGame(store, parsed) {
  if (store.hasGame(parsed.key)) return parsed;

  const matchedKey = store.resolveExistingKey(parsed.key);
  if (matchedKey) {
    // Match por substring pode ser ruído de chat em volta do MESMO jogo
    // ("minecraft manda ver!!") ou um jogo diferente com nome parecido
    // ("Elden Ring Nightreign" batendo com "Elden Ring" já existente). Só
    // aceita o match direto se o que sobra parece ruído comum; senão
    // confere na RAWG se o texto inteiro é um jogo diferente.
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
  // Passado pro getDonorAvatar de cada doador -- avisa quem já tava vendo
  // o placar assim que uma foto que não estava em cache chegar.
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
    mpDisconnected: store.getState("mpDisconnected", "false") === "true",
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

  const username = fallbackUsername;
  const message = fallbackMessage;
  const amountCents = fallbackAmount;

  const isOpen = store.getState("open", "true") === "true";
  if (!isOpen) {
    store.logUnparsedEvent({ amountCents, username, rawMessage: message, providerId: id });
    broadcastUpdate(leilaoId, store, { type: "closed", username, amount: centsToNumber(amountCents), message });
    return;
  }

  let parsed = parseMessage(message);
  if (!parsed) {
    store.logUnparsedEvent({ amountCents, username, rawMessage: message, providerId: id });
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
    providerId: id,
  });
  if (parsed.action === "remove") store.setState("lastSabotagedKey", game.key);

  broadcastUpdate(leilaoId, store, {
    type: parsed.action,
    username,
    amount: centsToNumber(amountCents),
    message,
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
    // id (não só nesse type "add"/"remove", mas em qualquer processDonationMessage
    // que aplique de verdade) -- é isso que deixa o modal de doação (Fase 5)
    // reconhecer "foi O MEU pagamento que confirmou" e fechar sozinho, sem
    // afetar quem só está assistindo o board normalmente (campo extra, nenhum
    // listener existente em app.js lê ou quebra com isso).
    paymentId: id,
  });

  touchActivity(store);
  maybeFetchGameImage(leilaoId, store, game.key, game.name, needsImage);
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

// ---------- conexão com o Mercado Pago (OAuth marketplace) ----------
// Diferente do login com a Twitch: aqui a sessão Twitch já precisa
// existir ANTES (é ela que diz de QUEM é a conta MP sendo conectada).
// Uma conexão vale pro streamer inteiro (chave twitch_user_id, ver
// src/streamersStore.js), não por leilão -- reconectar de qualquer
// leilão dele atualiza a mesma linha.

app.get("/auth/mercadopago/start", (req, res) => {
  if (!process.env.MP_CLIENT_ID || !process.env.MP_CLIENT_SECRET) {
    return res.status(500).send("Conexão com o Mercado Pago não está configurada nesse servidor.");
  }
  const twitchSession = getTwitchSession(req);
  if (!twitchSession) {
    return res.status(401).send("Faça login com a Twitch antes de conectar o Mercado Pago.");
  }

  const state = crypto.randomBytes(32).toString("base64url");
  const returnTo = safeReturnToMp(req.query.returnTo);

  try {
    // twitchUserId vai DENTRO do cookie assinado, não é lido de novo da
    // sessão Twitch no callback -- assim a conexão fica presa a quem
    // iniciou o fluxo, mesmo que a sessão Twitch mude nesse meio tempo
    // (ex: logout em outra aba enquanto autoriza no Mercado Pago).
    session.setCookie(req, res, "leilao_mp_oauth_state", { state, returnTo, twitchUserId: twitchSession.twitchUserId }, OAUTH_STATE_MAX_AGE_SECONDS);
  } catch (err) {
    console.error("Falha ao iniciar conexão com o Mercado Pago:", err.message);
    return res.status(500).send("Não foi possível iniciar a conexão. Tente de novo.");
  }

  res.redirect(mpAuth.buildAuthorizeUrl({ redirectUri: buildMpRedirectUri(req), state }));
});

app.get("/auth/mercadopago/callback", async (req, res) => {
  const statePayload = session.getCookie(req, "leilao_mp_oauth_state");
  session.clearCookie(req, res, "leilao_mp_oauth_state");

  if (!statePayload) {
    return res.status(400).send("Sessão de conexão expirou. Volte e tente de novo.");
  }
  if (req.query.error) {
    return res.redirect(safeReturnToMp(statePayload.returnTo));
  }
  if (!req.query.state || !timingSafeEqualString(req.query.state, statePayload.state)) {
    return res.status(400).send("Estado de conexão inválido. Tente de novo.");
  }
  if (!req.query.code) {
    return res.status(400).send("Código de autorização ausente.");
  }

  try {
    const redirectUri = buildMpRedirectUri(req);
    const tokenResult = await mpAuth.exchangeCodeForToken({ code: req.query.code, redirectUri });
    await streamersStore.upsertStreamer({
      twitchUserId: statePayload.twitchUserId,
      mpUserId: tokenResult.userId,
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      publicKey: tokenResult.publicKey,
      expiresAt: tokenResult.expiresAt,
    });
    // (Re)conectar limpa o aviso de desconectado em TODOS os leilões dessa
    // conta de uma vez -- a conexão é por streamer, não por leilão.
    setLeiloesMpDisconnected(statePayload.twitchUserId, false);
    res.redirect(safeReturnToMp(statePayload.returnTo));
  } catch (err) {
    console.error("Erro ao conectar Mercado Pago:", err.message);
    res.status(502).send("Não foi possível confirmar a conexão com o Mercado Pago. Tente de novo.");
  }
});

app.post("/api/session/logout", (req, res) => {
  session.clearCookie(req, res, "leilao_session");
  res.json({ ok: true });
});

// httpOnly esconde o cookie do JS do navegador de propósito (é o que
// impede um XSS de roubar a sessão) — por isso o front-end precisa
// perguntar pro servidor quem está logado, em vez de ler o cookie direto.
app.get("/api/session/me", async (req, res) => {
  const s = getTwitchSession(req);
  if (!s) return res.json({ loggedIn: false });

  // mpConnected é por CONTA (twitch_user_id), não por leilão -- ver
  // streamersStore.js. É o que decide se o formulário de criação libera
  // o botão de submeter (mesmo critério que já existe pro login da Twitch).
  const streamer = await streamersStore.findByTwitchUserId(s.twitchUserId);
  res.json({
    loggedIn: true,
    twitchUserId: s.twitchUserId,
    twitchLogin: s.twitchLogin,
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
    mpConnected: !!streamer,
  });
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

    // Reconfere no servidor (nunca confia numa flag mandada pelo cliente):
    // sem Mercado Pago conectado nessa conta, o leilão nasceria sem
    // nenhum jeito de receber doação nenhuma.
    const streamer = await streamersStore.findByTwitchUserId(twitchSession.twitchUserId);
    if (!streamer) {
      return res.status(409).json({ error: "Conecte sua conta do Mercado Pago antes de criar o leilão" });
    }

    const { title, password } = req.body || {};
    const { id } = await registry.createLeilao({
      title,
      host: twitchSession.displayName,
      hostAvatar: twitchSession.avatarUrl,
      hostTwitchUserId: twitchSession.twitchUserId,
      hostTwitchLogin: twitchSession.twitchLogin,
      password,
    });
    res.json({ ok: true, id, url: `/l/${id}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Soma o arquivado (rounds já zerados, ver archiveAuction em src/db.js) com
// o que sobrou do round aberto ainda não refletido no arquivo. Não dá pra
// só somar archivedTotal + totalRaised ao vivo: como encerrar já arquiva
// sozinho (openRound: true), o snapshot mais recente pode já refletir boa
// parte do total ao vivo, e somar os dois contaria 2x. Se o snapshot mais
// recente é um round "aberto", ele é a melhor estimativa do que já foi
// contado -- só soma a diferença pro total ao vivo atual.
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

// Ranking dos leilões de UM streamer contra ele mesmo, não cross-streamer.
// Usado pelo botão "Ranking" do board (ver GET /api/l/:id/ranking abaixo,
// que resolve o twitchUserId do dono e chama isso).
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

// Leilão-scoped pra não precisar expor o twitchUserId pro cliente --
// resolve o dono a partir do :id. Sem dono verificado, ranking vazio.
app.get("/api/l/:id/ranking", loadLeilao, (req, res) => {
  const meta = registry.getLeilaoMeta(req.leilaoId);
  res.json({ ranking: computeOwnerRanking(meta && meta.ownerTwitchUserId) });
});

// Fundo decorativo do board (mosaico de capas) -- não é dado de leilão
// específico, sem :id nem auth. fetchPopularCovers cacheia/degrada sozinho.
app.get("/api/board-bg-covers", async (req, res) => {
  const covers = await fetchPopularCovers();
  res.set("Cache-Control", "public, max-age=1800");
  res.json({ covers });
});

// Apaga um leilão inteiro (registro + dados) -- moderação/limpeza, exige
// segredo do DONO do site (SUPER_ADMIN_SECRET), não a senha do leilão.
// Sem essa variável configurada, nega sempre.
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

// Igual a rota acima, mas apaga TODOS os leilões registrados de uma vez --
// faxina geral, sem precisar de lista de ids em mãos.
app.delete("/api/admin/leiloes", (req, res) => {
  const secret = process.env.SUPER_ADMIN_SECRET || "";
  const supplied = req.header("x-super-admin-secret") || "";
  if (!secret || !timingSafeEqualString(supplied, secret)) {
    return res.status(401).json({ error: "Segredo de super-admin inválido ou não configurado" });
  }
  const ids = registry.listLeilaoIds();
  for (const id of ids) {
    registry.deleteLeilao(id);
    deleteStore(id);
    deleteUploadedBackgroundsFor(id);
  }
  res.json({ ok: true, deletedCount: ids.length, deletedIds: ids });
});

// ---------- board e painel por leilão ----------
// (painel de admin = o próprio board em modo apresentador, ver
// presenter-toggle/settings.js)

app.get("/l/:id", (req, res) => {
  if (!registry.leilaoExists(req.params.id)) return res.status(404).send("Leilão não encontrado");
  res.set("Referrer-Policy", "no-referrer");
  res.sendFile(path.join(__dirname, "public", "board.html"));
});

// Página de doação standalone -- o mesmo fluxo do modal "Doar" do board,
// só que como link próprio (sem precisar abrir o board e achar o botão),
// pra dar pro streamer fixar/compartilhar direto no chat da live.
app.get("/l/:id/doar", (req, res) => {
  if (!registry.leilaoExists(req.params.id)) return res.status(404).send("Leilão não encontrado");
  res.set("Referrer-Policy", "no-referrer");
  res.sendFile(path.join(__dirname, "public", "doar.html"));
});

// Overlay de alerta pra Browser Source do OBS/Streamlabs -- fundo
// transparente, mostra um card animado a cada doação de verdade (ver
// public/js/alerta.js). Página própria (não o board) porque um Browser
// Source precisa de uma URL fixa e isolada, sem nenhum outro elemento do
// site por trás.
app.get("/l/:id/alerta", (req, res) => {
  if (!registry.leilaoExists(req.params.id)) return res.status(404).send("Leilão não encontrado");
  res.set("Referrer-Policy", "no-referrer");
  res.sendFile(path.join(__dirname, "public", "alerta.html"));
});

// ---------- rotas públicas (id-scoped) ----------

app.get("/api/l/:id/leaderboard", loadLeilao, (req, res) => {
  res.json(serializeLeaderboard(req.store, req.leilaoId));
});

app.get("/api/l/:id/recap", loadLeilao, (req, res) => {
  res.json(buildRecap(req.store));
});

// Histórico de rounds já zerados. Pública como o /recap normal -- mesmo
// tipo de dado que já era visível ao vivo, não expõe nada novo.
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

// Cria a cobrança Pix pro modal/página de doação -- pública, sem senha de
// admin, qualquer visitante do board pode doar. O dinheiro é criado como
// sendo da conta MP do STREAMER (application_fee retém a parte da
// plataforma), nunca passa pela nossa conta. Não aplica a contribuição no
// catálogo aqui -- isso só acontece quando o webhook confirmar "paid".
app.post("/api/l/:id/doacao", loadLeilao, async (req, res) => {
  const { leilaoId, store } = req;
  const { name, amount, action, donorUsername } = req.body || {};

  if (!name || !amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Informe o jogo e um valor válido" });
  }
  const isOpen = store.getState("open", "true") === "true";
  if (!isOpen) {
    return res.status(400).json({ error: "Esse leilão está encerrado no momento" });
  }
  const parsed = parseMessage(`${action === "remove" ? "-" : "+"}${name}`);
  if (!parsed) return res.status(400).json({ error: "Nome de jogo inválido" });

  let streamer;
  try {
    const meta = registry.getLeilaoMeta(leilaoId);
    const ownerTwitchUserId = meta && meta.ownerTwitchUserId;
    streamer = ownerTwitchUserId ? await streamersStore.findByTwitchUserId(ownerTwitchUserId) : null;
  } catch (err) {
    // Sem esse catch, um erro de Postgres vira promise rejeitada sem
    // handler e derruba o processo Node inteiro (unhandled rejection),
    // tirando do ar TODOS os leilões, não só essa doação.
    console.error(`[doação] erro ao buscar streamer (leilaoId="${leilaoId}"):`, err.message);
    return res.status(502).json({ error: "Não foi possível verificar a conexão com o Mercado Pago agora. Tente de novo em instantes." });
  }
  if (!streamer) {
    return res.status(409).json({ error: "O streamer ainda não conectou o Mercado Pago nesse leilão -- avise ele." });
  }

  const valorTotalCents = Math.round(Number(amount) * 100);
  const applicationFeeCents = Math.round(valorTotalCents * 0.03);
  const externalReference = paymentsStore.buildExternalReference(leilaoId);
  const cleanDonorUsername = (donorUsername || "").trim().slice(0, 60) || "Anônimo";
  const rawMessage = `${action === "remove" ? "-" : "+"}${name}`;

  try {
    await paymentsStore.createPending({
      leilaoId,
      streamerId: streamer.id,
      externalReference,
      valorTotalCents,
      applicationFeeCents,
      donorUsername: cleanDonorUsername,
      donorMessage: rawMessage,
    });
  } catch (err) {
    console.error(`[doação] erro ao registrar pagamento pendente (leilaoId="${leilaoId}"):`, err.message);
    return res.status(502).json({ error: "Não foi possível gerar o Pix agora. Tente de novo em instantes." });
  }

  try {
    // Placeholder de e-mail: o doador não faz cadastro, só escolhe um nome
    // de exibição. A API do MP valida o FORMATO do e-mail (nunca envia
    // nada pra cá) e recusa TLDs reservados como .local/.test/.invalid --
    // .com passa porque é um TLD comum de verdade, mesmo o domínio
    // específico não existindo.
    const payerEmail = `${normalizeKey(cleanDonorUsername).replace(/\s+/g, ".") || "doador"}@doador.leilao-de-jogos.com`;
    const payment = await mpApi.createPixPayment({
      accessToken: streamer.accessToken,
      transactionAmountCents: valorTotalCents,
      applicationFeeCents,
      description: `Doação -- ${rawMessage}`,
      externalReference,
      payerEmail,
      idempotencyKey: externalReference,
    });
    await paymentsStore.markCreated(externalReference, payment.mpPaymentId);
    res.json({
      paymentId: payment.mpPaymentId,
      qrCodeBase64: payment.qrCodeBase64,
      copyPaste: payment.qrCode,
      valorTotal: centsToNumber(valorTotalCents),
    });
  } catch (err) {
    if (err.status === 401) {
      // Token do streamer não é mais válido -- ele precisa reconectar.
      await streamersStore.markDisconnected(ownerTwitchUserId);
      setLeiloesMpDisconnected(ownerTwitchUserId, true);
    }
    console.error(`[doação] erro ao criar cobrança Pix (leilaoId="${leilaoId}"):`, err.message);
    res.status(502).json({ error: "Não foi possível gerar o Pix agora. Tente de novo em instantes." });
  }
});

// Webhook do Mercado Pago -- UMA URL só pro app inteiro (registrada uma vez
// na aplicação), porque o MP não sabe de leilão nenhum -- quem correlaciona
// é a nossa própria tabela payments (por mp_payment_id). Log em cada etapa
// de propósito: sem isso, uma doação sumida não deixa pista nenhuma pra
// investigar depois.
app.post("/webhook/mercadopago", async (req, res) => {
  res.sendStatus(200); // confirma recebimento primeiro

  const dataId = req.query["data.id"] || req.query.id;
  const type = req.query.type || req.query.topic;
  console.log(`[webhook mercadopago] POST recebido -- type="${type}" dataId="${dataId}" x-request-id="${req.header("x-request-id")}"`);

  if (type !== "payment" || !dataId) {
    console.log(`[webhook mercadopago] ignorado -- type/dataId não é uma notificação de pagamento reconhecida.`);
    return;
  }

  const secret = process.env.MP_WEBHOOK_SECRET || "";
  const signatureOk = mpWebhook.verifySignature({
    signatureHeader: req.header("x-signature"),
    requestId: req.header("x-request-id"),
    dataId,
    secret,
  });
  if (!signatureOk) {
    console.warn(`[webhook mercadopago] assinatura inválida pra dataId="${dataId}", ignorado.`);
    return;
  }

  try {
    const payment = await paymentsStore.findByMpPaymentId(Number(dataId));
    if (!payment) {
      console.warn(`[webhook mercadopago] nenhum pagamento nosso encontrado pra mp_payment_id=${dataId}.`);
      return;
    }
    if (payment.status === "PAID") {
      console.log(`[webhook mercadopago] mp_payment_id=${dataId} já estava PAID, ignorando (idempotência).`);
      return;
    }

    const streamer = await streamersStore.findById(payment.streamerId);
    if (!streamer) {
      console.warn(`[webhook mercadopago] streamer id=${payment.streamerId} não encontrado pra mp_payment_id=${dataId}.`);
      return;
    }

    let mpPayment;
    try {
      mpPayment = await mpApi.getPayment({ accessToken: streamer.accessToken, paymentId: dataId });
    } catch (err) {
      if (err.status === 401) {
        await streamersStore.markDisconnected(streamer.twitchUserId);
        setLeiloesMpDisconnected(streamer.twitchUserId, true);
      }
      throw err;
    }
    console.log(`[webhook mercadopago] mp_payment_id=${dataId} status="${mpPayment.status}" leilaoId="${payment.leilaoId}"`);

    if (mpPayment.status !== "approved") {
      console.log(`[webhook mercadopago] status "${mpPayment.status}" não é "approved" ainda, nada a fazer por enquanto.`);
      return;
    }

    const marked = await paymentsStore.markPaid(Number(dataId));
    if (!marked) {
      console.log(`[webhook mercadopago] mp_payment_id=${dataId} já tinha sido marcado PAID por outra chamada (corrida entre webhooks), ignorando.`);
      return;
    }

    const store = getStore(payment.leilaoId);
    await processDonationMessage(payment.leilaoId, store, {
      id: String(dataId),
      fallbackUsername: payment.donorUsername,
      fallbackMessage: payment.donorMessage,
      fallbackAmount: payment.valorTotalCents,
    });
  } catch (err) {
    console.error(`[webhook mercadopago] erro ao processar dataId="${dataId}":`, err.message);
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
// Twitch (mesmo critério de requireLeilaoAdmin). Só um booleano, não
// precisa passar por requireLeilaoAdmin.
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
    providerId: null,
  });
  if (parsed.action === "remove") store.setState("lastSabotagedKey", game.key);

  broadcastUpdate(leilaoId, store, {
    type: parsed.action,
    username: username || "admin",
    amount: Number(amount),
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
  });

  // touchActivity SEM reopen=true: lançamento manual não deve reabrir um
  // leilão encerrado sozinho, mesma regra do webhook real.
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
    touchActivity(store, true); // reabrir dá um fôlego novo
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

// Soma 5 minutos ao que já falta (ou ao pausado) -- não usa touchActivity
// aqui porque isso reseta lastActivityAt pra AGORA em vez de somar.
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

// ---------- estáticos ----------
// Depois das rotas de página (/, /l/:id) pra elas terem prioridade; os
// arquivos de public/ (css, js, board.html direto) continuam acessíveis
// por trás.
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
