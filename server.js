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
const { hashPassword, verifyPassword, timingSafeEqualString } = require("./src/passwords");
const { parseMessage, normalizeKey, leftoverAfterMatch, looksLikeNoise } = require("./src/parser");
const gameImages = require("./src/gameImages");
const { getMediaAdapter, mediaLabel, normalizeMode, MODES: LEILAO_MODES } = require("./src/mediaAdapter");
const { fetchTwitchAvatar } = require("./src/twitchClient");
const twitchAuth = require("./src/twitchAuth");
const session = require("./src/session");
const efiWebhook = require("./src/efiWebhook");
const efiApi = require("./src/efiApi");
const ledgerStore = require("./src/ledgerStore");
const streamersStore = require("./src/streamersStore");
const streamerPixKeysStore = require("./src/streamerPixKeysStore");
const paymentsStore = require("./src/paymentsStore");
const freeTts = require("./src/freeTts");

// homologacao até confirmar a conta de Produção da Efí de verdade -- trocar
// via variável de ambiente, sem precisar redeploy de código
const EFI_ENV = process.env.EFI_ENV === "producao" ? "producao" : "homologacao";
function efiChavePix() {
  const chave = EFI_ENV === "producao" ? process.env.EFI_CHAVE_PIX_PRODUCAO : process.env.EFI_CHAVE_PIX_HOMOLOGACAO;
  if (!chave) throw new Error(`EFI_CHAVE_PIX_${EFI_ENV === "producao" ? "PRODUCAO" : "HOMOLOGACAO"} não configurada`);
  return chave;
}

const DONOR_VOICE_IDS = new Set(["1"]);

const app = express();
// Railway termina TLS na borda; sem isso req.protocol sempre volta "http".
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

function createRateLimiter(windowMs, maxHits) {
  const hits = new Map();
  return {
    isLimited(key) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      hits.set(key, arr);
      return arr.length >= maxHits;
    },
    record(key) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      arr.push(now);
      hits.set(key, arr);
    },
  };
}

const loginRateLimiter = createRateLimiter(5 * 60_000, 10);
const superAdminRateLimiter = createRateLimiter(10 * 60_000, 5);
const gameSearchRateLimiter = createRateLimiter(60_000, 20);
const donationRateLimiter = createRateLimiter(60_000, 5);
const ttsRateLimiter = createRateLimiter(60_000, 20);

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
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
      return cb(new Error("Envie uma imagem PNG, JPG, WEBP ou GIF"));
    }
    cb(null, true);
  },
});

function deleteOldUploadedBackground(store) {
  const current = store.getState("backgroundImageUrl");
  if (!current || !current.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(current));
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") console.error("Falha ao apagar imagem de fundo antiga:", err.message);
  });
}

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

const DEFAULT_AUTO_CLOSE_MS = 5 * 60 * 1000;

function getAutoCloseMs(store) {
  const stored = Number(store.getState("timerDurationMs", DEFAULT_AUTO_CLOSE_MS));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_AUTO_CLOSE_MS;
}

const DEFAULT_QUALIFY_COUNT = 3;

function getQualifyCount(store) {
  const stored = Number(store.getState("qualifyCount", DEFAULT_QUALIFY_COUNT));
  return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : DEFAULT_QUALIFY_COUNT;
}

// zera o valor na resposta da API, não só esconde via CSS
function getHideTotalRaised(store) {
  return store.getState("hideTotalRaised", "false") === "true";
}

function getHostVerified(store) {
  return store.getState("hostVerified", "false") === "true";
}

// ---------- sessão / login com a Twitch ----------

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_STATE_MAX_AGE_SECONDS = 600;

// allowlist exata (não regex) pra fechar open-redirect
const ALLOWED_RETURN_PATHS = new Set(["/", "/meus-leiloes"]);
function safeReturnTo(value) {
  return ALLOWED_RETURN_PATHS.has(value) ? value : "/";
}

function buildTwitchRedirectUri(req) {
  return `${req.protocol}://${req.get("host")}/auth/twitch/callback`;
}

function getTwitchSession(req) {
  const payload = session.getCookie(req, "leilao_session");
  return payload && payload.twitchUserId ? payload : null;
}

const ADMIN_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

function getAdminLeiloes(req) {
  const payload = session.getCookie(req, "leilao_admin");
  return payload && Array.isArray(payload.leiloes) ? payload.leiloes : [];
}

// cada entrada carrega a versão vigente no momento em que a sessão foi
// concedida -- o dono pode invalidar todo mod de um leilão de uma vez só
// aumentando adminSessionVersion (ver /admin/revoke-mod-sessions), sem
// precisar trocar o SESSION_SECRET do site inteiro (que derrubaria todo
// mundo, em todos os leilões)
function hasAdminSession(req, leilaoId) {
  const entry = getAdminLeiloes(req).find((e) => e && e.id === leilaoId);
  if (!entry) return false;
  const currentVersion = req.store.getState("adminSessionVersion", 0);
  return Number(entry.v) === Number(currentVersion);
}

function grantAdminSession(req, res, leilaoId) {
  const version = req.store.getState("adminSessionVersion", 0);
  const leiloes = getAdminLeiloes(req).filter((e) => e && e.id !== leilaoId);
  leiloes.push({ id: leilaoId, v: version });
  session.setCookie(req, res, "leilao_admin", { leiloes }, ADMIN_SESSION_MAX_AGE_SECONDS);
}

function revokeAdminSession(req, res, leilaoId) {
  const leiloes = getAdminLeiloes(req).filter((e) => e && e.id !== leilaoId);
  if (leiloes.length === 0) {
    session.clearCookie(req, res, "leilao_admin");
  } else {
    session.setCookie(req, res, "leilao_admin", { leiloes }, ADMIN_SESSION_MAX_AGE_SECONDS);
  }
}

// ---------- helpers ----------

function centsToNumber(cents) {
  return Math.round(cents) / 100;
}

// reopen ignora timerLocked de propósito (reabrir é ação explícita do apresentador)
function touchActivity(store, reopen = false) {
  const locked = store.getState("timerLocked", "false") === "true";
  if (locked && !reopen) return;
  store.setState("lastActivityAt", String(Date.now()));
  if (reopen) {
    store.setState("open", "true");
    store.setState("leilaoOpenedAt", String(Date.now()));
  }
}

// streak de doações NUM JOGO ESPECÍFICO (não do leilão todo) -- só hype
// visual, nunca mexe em valor de doação. Ver src/db.js#registerGameCombo
const COMBO_WINDOW_MS = 60 * 1000;

function captureAuctionDuration(store) {
  const openedAt = Number(store.getState("leilaoOpenedAt", 0));
  if (openedAt > 0) {
    store.setState("lastAuctionDurationMs", String(Date.now() - openedAt));
  }
}

function archiveOpenRoundSnapshot(store) {
  const recap = buildRecap(store);
  if (recap.totalGames > 0) store.archiveAuction(recap, { openRound: true });
}

const donorAvatarCache = new Map();
const donorAvatarFetching = new Map();

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

async function resolveParsedGame(store, parsed) {
  if (store.hasGame(parsed.key)) return parsed;

  const media = getMediaAdapter(store);
  const matchedKey = store.resolveExistingKey(parsed.key);
  if (matchedKey) {
    const leftover = leftoverAfterMatch(parsed.key, matchedKey);
    if (!looksLikeNoise(leftover)) {
      const match = await media.identifyGameFromNoisyText(parsed.name);
      if (match) {
        const matchKey = normalizeKey(match.name);
        if (matchKey !== matchedKey) {
          return { ...parsed, key: matchKey, name: match.name };
        }
      }
    }
    const existing = store.getGame(matchedKey);
    return { ...parsed, key: matchedKey, name: existing.name };
  }

  const match = await media.identifyGameFromNoisyText(parsed.name);
  if (match) {
    return { ...parsed, key: normalizeKey(match.name), name: match.name };
  }

  return parsed;
}

function serializeLeaderboard(store, leilaoId) {
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
      combo: { count: row.comboCount || 0, expiresAt: row.comboExpiresAt || 0 },
    };
  });

  const donors = store.getTopDonors(10).map((d, index) => ({
    username: d.username,
    total: centsToNumber(d.total_cents),
    rank: index + 1,
    avatar: getDonorAvatar(d.username, onAvatarResolved),
  }));

  return {
    title: store.getState("title", "JogodaVez"),
    mode: normalizeMode(store.getState("mode", "jogos")),
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
    timerLocked: store.getState("timerLocked", "false") === "true",
  };
}

function buildRecap(store) {
  const rows = store.getLeaderboard();
  const donorCounts = store.getDonorCountByGame();
  const topDonorByGame = store.getTopDonorByGame();
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
    avatar: getDonorAvatar(d.username),
  }));

  const biggest = store.getBiggestDonation();
  const biggestDonation = biggest
    ? { username: biggest.username, amount: centsToNumber(biggest.amount_cents), gameName: biggest.game_name }
    : null;

  const durationMs = Number(store.getState("lastAuctionDurationMs", 0)) || null;

  return {
    title: store.getState("title", "JogodaVez"),
    mode: normalizeMode(store.getState("mode", "jogos")),
    host: store.getState("host", ""),
    hostAvatar: store.getState("hostAvatar", null),
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

function maybeFetchGameImage(leilaoId, store, key, name, needsImage) {
  if (!needsImage) return;
  getMediaAdapter(store).fetchGameImage(name)
    .then((imageUrl) => {
      if (!imageUrl) return;
      store.setGameImage(key, imageUrl);
      broadcastUpdate(leilaoId, store, null);
    })
    .catch((err) => console.error("Falha ao buscar imagem do jogo:", err.message));
}

function loadLeilao(req, res, next) {
  const id = req.params.id;
  if (!/^[a-z0-9_-]+$/i.test(id) || !registry.leilaoExists(id)) {
    return res.status(404).json({ error: "Leilão não encontrado" });
  }
  req.leilaoId = id;
  req.store = getStore(id);
  next();
}

// mais restrito que requireLeilaoAdmin de propósito: rotas de saldo/saque
// não podem aceitar sessão de moderador (código de uso único), só o dono
// de verdade -- moderador não deve conseguir mexer em dinheiro do streamer
function requireLeilaoOwner(req, res, next) {
  const twitchSession = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  if (twitchSession && meta && meta.ownerTwitchUserId && twitchSession.twitchUserId === meta.ownerTwitchUserId) {
    return next();
  }
  return res.status(401).json({ error: "Só o dono do leilão pode fazer isso." });
}

function requireLeilaoAdmin(req, res, next) {
  if (hasAdminSession(req, req.leilaoId)) return next();

  const twitchSession = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  if (twitchSession && meta && meta.ownerTwitchUserId && twitchSession.twitchUserId === meta.ownerTwitchUserId) {
    return next();
  }

  return res.status(401).json({ error: "Sessão de admin inválida ou expirada" });
}

async function processDonationMessage(leilaoId, store, { id, fallbackUsername, fallbackMessage, fallbackAmount, fallbackNote, fallbackVoiceId }) {
  if (store.isAlreadyProcessed(id)) return;
  // reserva o id antes do await abaixo, senão um retry do webhook chegando
  // nesse meio tempo passa pela checagem acima e conta a doação 2x
  store.markProcessed(id);

  const username = fallbackUsername;
  const message = fallbackMessage;
  const amountCents = fallbackAmount;
  const note = fallbackNote || null;

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

  // precisa rodar antes do broadcast, senão o timer só aparece esticado no próximo evento
  touchActivity(store);
  const combo = store.registerGameCombo(game.key, COMBO_WINDOW_MS);

  broadcastUpdate(leilaoId, store, {
    type: parsed.action,
    username,
    amount: centsToNumber(amountCents),
    message,
    note,
    voiceId: note ? fallbackVoiceId : null,
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
    paymentId: id,
    comboCount: combo.count,
  });

  maybeFetchGameImage(leilaoId, store, game.key, game.name, needsImage);
}

// ---------- login com a Twitch ----------

// GET de propósito: navegação de página inteira, consentimento cross-origin não funciona via XHR
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

app.get("/auth/twitch/callback", async (req, res) => {
  const statePayload = session.getCookie(req, "leilao_oauth_state");
  // limpa antes de qualquer checagem: torna o cookie de uso único, fecha replay
  session.clearCookie(req, res, "leilao_oauth_state");

  if (!statePayload) {
    return res.status(400).send("Sessão de login expirou. Volte e tente de novo.");
  }
  if (req.query.error) {
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

app.get("/api/session/me", (req, res) => {
  const s = getTwitchSession(req);
  if (!s) return res.json({ loggedIn: false });

  res.json({
    loggedIn: true,
    twitchUserId: s.twitchUserId,
    twitchLogin: s.twitchLogin,
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
  });
});

app.post("/api/l/:id/admin/unlink-account", loadLeilao, (req, res) => {
  const twitchSession = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  if (!twitchSession || !meta || !meta.ownerTwitchUserId || twitchSession.twitchUserId !== meta.ownerTwitchUserId) {
    return res.status(401).json({ error: "Sessão inválida" });
  }
  registry.unlinkOwner(req.leilaoId);
  res.json({ ok: true });
});

const PIX_KEY_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h entre trocar a chave e poder sacar

function pixKeyChangeCooldownRemainingMs(pixKeyInfo) {
  if (!pixKeyInfo || !pixKeyInfo.updatedAt) return 0;
  const elapsed = Date.now() - new Date(pixKeyInfo.updatedAt).getTime();
  return Math.max(0, PIX_KEY_CHANGE_COOLDOWN_MS - elapsed);
}

async function findOwnerStreamer(leilaoId) {
  const meta = registry.getLeilaoMeta(leilaoId);
  const ownerTwitchUserId = meta && meta.ownerTwitchUserId;
  if (!ownerTwitchUserId) return null;
  return streamersStore.ensureByTwitchUserId(ownerTwitchUserId);
}

app.get("/api/l/:id/admin/saldo", loadLeilao, requireLeilaoOwner, async (req, res) => {
  try {
    const streamer = await findOwnerStreamer(req.leilaoId);
    const [balanceCents, pixKeyInfo] = await Promise.all([
      ledgerStore.getBalance(streamer.id),
      streamerPixKeysStore.getPixKeyInfo(streamer.id),
    ]);
    const cooldownRemainingMs = pixKeyChangeCooldownRemainingMs(pixKeyInfo);
    res.json({
      balanceCents,
      pixKey: pixKeyInfo ? pixKeyInfo.pixKey : null,
      cooldownRemainingMs,
    });
  } catch (err) {
    console.error(`[saldo] erro (leilaoId="${req.leilaoId}"):`, err.message);
    res.status(502).json({ error: "Não foi possível consultar o saldo agora." });
  }
});

app.post("/api/l/:id/admin/pix-key", loadLeilao, requireLeilaoOwner, async (req, res) => {
  const pixKey = String((req.body && req.body.pixKey) || "").trim();
  if (!pixKey || pixKey.length > 140) {
    return res.status(400).json({ error: "Chave Pix inválida." });
  }
  try {
    const streamer = await findOwnerStreamer(req.leilaoId);
    await streamerPixKeysStore.setPixKey(streamer.id, pixKey);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[pix-key] erro (leilaoId="${req.leilaoId}"):`, err.message);
    res.status(502).json({ error: "Não foi possível salvar a chave Pix agora." });
  }
});

app.post("/api/l/:id/admin/saque", loadLeilao, requireLeilaoOwner, async (req, res) => {
  let streamer, pixKeyInfo;
  try {
    streamer = await findOwnerStreamer(req.leilaoId);
    pixKeyInfo = await streamerPixKeysStore.getPixKeyInfo(streamer.id);
  } catch (err) {
    console.error(`[saque] erro ao buscar streamer/chave (leilaoId="${req.leilaoId}"):`, err.message);
    return res.status(502).json({ error: "Não foi possível iniciar o saque agora." });
  }
  if (!pixKeyInfo || !pixKeyInfo.pixKey) {
    return res.status(400).json({ error: "Cadastre sua chave Pix antes de pedir saque." });
  }
  const pixKey = pixKeyInfo.pixKey;

  // cooldown entre trocar a chave Pix e poder sacar -- se a sessão do dono
  // for comprometida, isso impede drenar o saldo na hora trocando a chave
  // e sacando em seguida (dá tempo do dono perceber e agir)
  const cooldownRemainingMs = pixKeyChangeCooldownRemainingMs(pixKeyInfo);
  if (cooldownRemainingMs > 0) {
    const horas = Math.ceil(cooldownRemainingMs / 3_600_000);
    return res.status(400).json({
      error: `Chave Pix trocada recentemente -- por segurança, aguarde ~${horas}h antes de sacar.`,
    });
  }

  let withdrawal;
  try {
    withdrawal = await ledgerStore.createWithdrawal({ streamerId: streamer.id });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // idEnvio gerado ANTES da chamada e gravado no saque -- se o processo cair
  // logo depois de mandar pra Efí, mesmo sem resposta, o registro de qual
  // idEnvio foi usado sobrevive (dá pra consultar o status depois em vez de
  // perder o rastro do envio)
  const idEnvio = efiApi.gerarIdEnvio();
  await ledgerStore.attachEfiEnvioId(withdrawal.withdrawalId, idEnvio);

  try {
    await efiApi.enviarPix(EFI_ENV, {
      idEnvio,
      valorCentavos: withdrawal.sentCents,
      chavePagadora: efiChavePix(),
      chaveFavorecido: pixKey,
      infoPagador: "Saque JogodaVez",
    });
    // NÃO marca como enviado aqui -- a Efí só aceitou a solicitação
    // (EM_PROCESSAMENTO), o resultado de verdade (REALIZADO/NAO_REALIZADO)
    // vem depois, assíncrono, via webhook (ou via reconciliação, se o
    // webhook não chegar -- ver src/reconciliation.js). Confirmado nesta
    // mesma investigação que tratar a resposta síncrona como sucesso é
    // exatamente o bug que gerava saldo debitado sem o dinheiro ter saído.
    res.json({ ok: true, status: "pending", sentCents: withdrawal.sentCents, feeCents: withdrawal.feeCents });
  } catch (err) {
    // erro síncrono (ex: chave inválida, HTTP 4xx/5xx) -- aqui sim já sabemos
    // que não foi aceito, então reverte imediatamente em vez de deixar pendente
    console.error(`[saque] falha ao enviar Pix (withdrawalId=${withdrawal.withdrawalId}):`, err.message);
    await ledgerStore.markWithdrawalFailed(withdrawal.withdrawalId);
    res.status(502).json({ error: "Não foi possível concluir o saque agora, o valor voltou pro seu saldo. Tente de novo em instantes." });
  }
});

app.get("/api/meus-leiloes", (req, res) => {
  const twitchSession = getTwitchSession(req);
  if (!twitchSession) return res.status(401).json({ error: "Faça login com a Twitch" });

  const rows = registry.listLeiloesByOwner(twitchSession.twitchUserId)
    .map((meta) => {
      const store = getStore(meta.id);
      return {
        id: meta.id,
        title: store.getState("title", meta.title || "JogodaVez"),
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

app.get("/termos", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "termos.html"));
});

app.get("/privacidade", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacidade.html"));
});

// ---------- criação de leilão ----------

app.post("/api/leiloes", async (req, res) => {
  try {
    const twitchSession = getTwitchSession(req);
    if (!twitchSession) {
      return res.status(401).json({ error: "Faça login com a Twitch antes de criar o leilão" });
    }

    await streamersStore.ensureByTwitchUserId(twitchSession.twitchUserId);

    const { title } = req.body || {};
    const { id } = await registry.createLeilao({
      title,
      host: twitchSession.displayName,
      hostAvatar: twitchSession.avatarUrl,
      hostTwitchUserId: twitchSession.twitchUserId,
      hostTwitchLogin: twitchSession.twitchLogin,
    });
    res.json({ ok: true, id, url: `/l/${id}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// archivedTotal + liveTotal contaria 2x (encerrar já arquiva o round aberto) --
// só soma a diferença ainda não refletida no arquivo
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
    .filter((id) => !getHideTotalRaised(getStore(id)))
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

function computeOwnerRanking(twitchUserId) {
  if (!twitchUserId) return [];
  return registry
    .listLeiloesByOwner(twitchUserId)
    .map((meta) => {
      const store = getStore(meta.id);
      if (getHideTotalRaised(store)) return null;
      return {
        id: meta.id,
        title: store.getState("title", meta.title || "JogodaVez"),
        totalRaised: computeLeilaoTotalRaised(store),
        createdAt: meta.createdAt || "",
      };
    })
    .filter((row) => row && row.totalRaised > 0)
    .sort((a, b) => b.totalRaised - a.totalRaised)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

app.get("/api/l/:id/ranking", loadLeilao, (req, res) => {
  const meta = registry.getLeilaoMeta(req.leilaoId);
  res.json({ ranking: computeOwnerRanking(meta && meta.ownerTwitchUserId) });
});

app.get("/api/board-bg-covers", async (req, res) => {
  const leilaoId = String(req.query.leilaoId || "");
  const media = leilaoId && /^[a-z0-9_-]+$/i.test(leilaoId) && registry.leilaoExists(leilaoId)
    ? getMediaAdapter(getStore(leilaoId))
    : gameImages;
  const covers = await media.fetchPopularCovers();
  // sem Cache-Control aqui de propósito -- a URL não muda quando a modalidade troca
  // (mesma leilaoId), e um cache HTTP guardaria capa de jogo depois de trocar pra
  // filme (ou vice-versa); a busca em si já é cacheada 6h no módulo de mídia
  res.set("Cache-Control", "no-store");
  res.json({ covers });
});

const IMAGE_PROXY_ALLOWED_HOSTS = new Set(["media.rawg.io", "static-cdn.jtvnw.net", "image.tmdb.org"]);

// mesma origem = sem depender do header CORS da CDN (a da RAWG às vezes não manda de forma
// confiável), usado só pelo canvas do recap que precisa ler pixel da imagem
app.get("/api/image-proxy", async (req, res) => {
  const target = String(req.query.url || "");
  let parsed;
  try {
    parsed = new URL(target);
  } catch (err) {
    return res.status(400).end();
  }
  if (parsed.protocol !== "https:" || !IMAGE_PROXY_ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(400).end();
  }
  try {
    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) return res.status(upstream.status).end();
    res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(502).end();
  }
});

app.delete("/api/admin/leiloes/:id", (req, res) => {
  if (superAdminRateLimiter.isLimited(req.ip)) {
    return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
  }
  const secret = process.env.SUPER_ADMIN_SECRET || "";
  const supplied = req.header("x-super-admin-secret") || "";
  if (!secret || !timingSafeEqualString(supplied, secret)) {
    superAdminRateLimiter.record(req.ip);
    return res.status(401).json({ error: "Segredo de super-admin inválido ou não configurado" });
  }
  const { id } = req.params;
  if (!registry.leilaoExists(id)) {
    return res.status(404).json({ error: "Leilão não encontrado" });
  }
  // ordem importa: apaga o registro primeiro pra nenhuma rota nova achar esse id durante a limpeza
  registry.deleteLeilao(id);
  deleteStore(id);
  deleteUploadedBackgroundsFor(id);
  res.json({ ok: true, id });
});

app.delete("/api/admin/leiloes", (req, res) => {
  if (superAdminRateLimiter.isLimited(req.ip)) {
    return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
  }
  const secret = process.env.SUPER_ADMIN_SECRET || "";
  const supplied = req.header("x-super-admin-secret") || "";
  if (!secret || !timingSafeEqualString(supplied, secret)) {
    superAdminRateLimiter.record(req.ip);
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

app.get("/l/:id", (req, res) => {
  if (!registry.leilaoExists(req.params.id)) return res.status(404).send("Leilão não encontrado");
  res.set("Referrer-Policy", "no-referrer");
  res.sendFile(path.join(__dirname, "public", "board.html"));
});

app.get("/l/:id/doar", (req, res) => {
  if (!registry.leilaoExists(req.params.id)) return res.status(404).send("Leilão não encontrado");
  res.set("Referrer-Policy", "no-referrer");
  res.sendFile(path.join(__dirname, "public", "doar.html"));
});

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

const MIN_DONATION_CENTS = 500; // R$5 -- mesmo valor em public/js/doar.js, mantenha os dois em sincronia

// não aplica a contribuição aqui -- só quando o webhook confirmar o pagamento
app.post("/api/l/:id/doacao", loadLeilao, async (req, res) => {
  if (donationRateLimiter.isLimited(req.ip)) {
    return res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto e tente de novo." });
  }
  donationRateLimiter.record(req.ip);

  const { leilaoId, store } = req;
  const { name, amount, action, donorUsername, donorNote, donorVoiceId } = req.body || {};

  const amountCents = Math.round(Number(amount) * 100);
  if (!name || !amount || Number.isNaN(amountCents) || amountCents < MIN_DONATION_CENTS) {
    return res.status(400).json({ error: `Informe o ${mediaLabel(store)} e um valor de pelo menos R$${(MIN_DONATION_CENTS / 100).toFixed(2).replace(".", ",")}` });
  }
  const isOpen = store.getState("open", "true") === "true";
  if (!isOpen) {
    return res.status(400).json({ error: "Esse leilão está encerrado no momento" });
  }
  const parsed = parseMessage(`${action === "remove" ? "-" : "+"}${name}`);
  if (!parsed) return res.status(400).json({ error: `Nome de ${mediaLabel(store)} inválido` });

  let streamer;
  try {
    const meta = registry.getLeilaoMeta(leilaoId);
    const ownerTwitchUserId = meta && meta.ownerTwitchUserId;
    // streamer existe só por vínculo com o Twitch -- não tem "conectar" separado
    streamer = ownerTwitchUserId ? await streamersStore.ensureByTwitchUserId(ownerTwitchUserId) : null;
  } catch (err) {
    // sem esse catch, o erro vira rejection sem handler e derruba o processo inteiro
    console.error(`[doação] erro ao buscar streamer (leilaoId="${leilaoId}"):`, err.message);
    return res.status(502).json({ error: "Não foi possível iniciar a doação agora. Tente de novo em instantes." });
  }
  if (!streamer) {
    return res.status(409).json({ error: "Esse leilão não tem um streamer vinculado." });
  }

  const valorTotalCents = amountCents;
  let feeConfig, applicationFeeCents;
  try {
    feeConfig = await ledgerStore.getFeeConfig();
    applicationFeeCents = valorTotalCents - ledgerStore.computeDonationSplit(valorTotalCents, feeConfig).streamerShareCents;
  } catch (err) {
    console.error(`[doação] erro ao calcular taxa (leilaoId="${leilaoId}"):`, err.message);
    return res.status(502).json({ error: "Não foi possível gerar o Pix agora. Tente de novo em instantes." });
  }

  const externalReference = paymentsStore.buildExternalReference(leilaoId);
  const cleanDonorUsername = (donorUsername || "").trim().slice(0, 60) || "Anônimo";
  const cleanDonorNote = (donorNote || "").trim().slice(0, 140);
  const cleanDonorVoiceId = cleanDonorNote && DONOR_VOICE_IDS.has(donorVoiceId) ? donorVoiceId : null;
  const rawMessage = `${action === "remove" ? "-" : "+"}${name}`;

  try {
    await paymentsStore.createPending({
      leilaoId,
      streamerId: streamer.id,
      externalReference,
      donorNote: cleanDonorNote,
      donorVoiceId: cleanDonorVoiceId,
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
    const cobranca = await efiApi.criarCobranca(EFI_ENV, {
      valorCentavos: valorTotalCents,
      chave: efiChavePix(),
      solicitacaoPagador: `Doação -- ${rawMessage}`.slice(0, 140),
    });
    await paymentsStore.markCreatedEfi(externalReference, cobranca.txid);

    // POST /v2/cob não devolve a imagem do QR, só o copia-e-cola -- busca
    // separada pelo loc.id que veio na resposta da cobrança
    let qrCodeBase64 = null;
    try {
      const qr = await efiApi.buscarQrCode(EFI_ENV, cobranca.loc.id);
      qrCodeBase64 = qr.imagemQrcode ? qr.imagemQrcode.replace(/^data:image\/png;base64,/, "") : null;
    } catch (err) {
      console.error(`[doação] falha ao buscar QR code (txid="${cobranca.txid}"):`, err.message);
    }

    res.json({
      paymentId: cobranca.txid,
      qrCodeBase64,
      copyPaste: cobranca.pixCopiaECola,
      valorTotal: centsToNumber(valorTotalCents),
    });
  } catch (err) {
    console.error(`[doação] erro ao criar cobrança Pix (leilaoId="${leilaoId}"):`, err.message);
    res.status(502).json({ error: "Não foi possível gerar o Pix agora. Tente de novo em instantes." });
  }
});

app.get("/api/l/:id/game-search", loadLeilao, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  if (gameSearchRateLimiter.isLimited(req.ip)) return res.status(429).json({ results: [] });
  gameSearchRateLimiter.record(req.ip);

  const { store } = req;
  const results = await getMediaAdapter(store).searchGames(q);
  res.json({ results: results.filter((g) => !store.hasGame(normalizeKey(g.name))) });
});

app.get("/api/tts", async (req, res) => {
  const text = String(req.query.text || "").trim();
  if (!text) return res.status(400).json({ error: "Informe o texto" });
  if (ttsRateLimiter.isLimited(req.ip)) return res.status(429).json({ error: "Muitas requisições, tente de novo em instantes" });
  ttsRateLimiter.record(req.ip);

  try {
    const audio = await freeTts.synthesize(text);
    if (!audio) return res.status(400).json({ error: "Texto vazio" });
    res.set("Content-Type", audio.contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(audio.buffer);
  } catch (err) {
    console.error("[tts] falha ao sintetizar:", err.message);
    res.status(502).json({ error: "Não foi possível gerar o áudio" });
  }
});

// A Efí não assina o webhook (diferente do MP) -- autenticidade é pelo
// segredo imprevisível na própria URL (ver src/efiWebhook.js; o IP deles
// não é confiável o bastante pra bloquear, só logamos quando é inesperado).
app.post("/webhooks/efi/pix/:token", (req, res) => {
  const authentic = efiWebhook.isAuthentic({
    pathToken: req.params.token,
    secret: process.env.EFI_WEBHOOK_SECRET || "",
  });
  if (!authentic) {
    console.warn(`[webhook efi] requisição não autenticada de ip="${req.ip}", rejeitada.`);
    return res.sendStatus(403);
  }
  if (!efiWebhook.isKnownIp(req.ip)) {
    console.warn(`[webhook efi] token válido mas ip="${req.ip}" fora da lista conhecida (só log, não bloqueia).`);
  }

  // responde 200 já, antes de processar -- o webhook não deve esperar nem falhar por causa da gente
  res.sendStatus(200);

  const eventos = Array.isArray(req.body && req.body.pix) ? req.body.pix : [];
  for (const evento of eventos) {
    // recebimento tem txid, status de envio tem "tipo" (ex: "SOLICITACAO") e
    // não tem txid -- documentado assim pela Efí, os dois vêm no mesmo array
    if (evento.tipo) {
      processarStatusEnvioPix(evento).catch((err) => {
        console.error(`[webhook efi] erro ao processar status de envio (idEnvio="${evento.gnExtras && evento.gnExtras.idEnvio}"):`, err.message);
      });
    } else {
      creditarPixRecebido(evento).catch((err) => {
        console.error(`[webhook efi] erro ao processar txid="${evento.txid}":`, err.message);
      });
    }
  }
});

async function creditarPixRecebido(evento) {
  const txid = evento.txid;
  console.log(`[webhook efi] pix recebido -- txid="${txid}" endToEndId="${evento.endToEndId || ""}" valor="${evento.valor || ""}"`);
  if (!txid) return;

  const payment = await paymentsStore.findByEfiTxid(txid);
  if (!payment) {
    console.warn(`[webhook efi] nenhum pagamento nosso encontrado pra txid="${txid}".`);
    return;
  }
  if (payment.status === "PAID") {
    console.log(`[webhook efi] txid="${txid}" já estava PAID, ignorando (idempotência).`);
    return;
  }

  const marked = await paymentsStore.markPaidEfi(txid);
  if (!marked) {
    console.log(`[webhook efi] txid="${txid}" já tinha sido marcado PAID por outra chamada (corrida entre webhooks), ignorando.`);
    return;
  }

  await ledgerStore.creditDonation({
    streamerId: payment.streamerId,
    paymentId: payment.id,
    grossCents: payment.valorTotalCents,
  });

  const store = getStore(payment.leilaoId);
  await processDonationMessage(payment.leilaoId, store, {
    id: txid,
    fallbackUsername: payment.donorUsername,
    fallbackMessage: payment.donorMessage,
    fallbackAmount: payment.valorTotalCents,
    fallbackNote: payment.donorNote,
    fallbackVoiceId: payment.donorVoiceId,
  });
}

async function processarStatusEnvioPix(evento) {
  const idEnvio = evento.gnExtras && evento.gnExtras.idEnvio;
  if (!idEnvio) {
    console.warn("[webhook efi] evento de status de envio sem gnExtras.idEnvio, ignorado.");
    return;
  }
  const erro = evento.gnExtras && evento.gnExtras.erro;
  const detalhe = erro ? `${erro.codigo || ""} ${erro.motivo || ""}`.trim() : null;
  await ledgerStore.resolveEnvioStatus(idEnvio, evento.status, detalhe);
}

// ---------- rotas de admin (id-scoped) ----------

app.post("/api/l/:id/admin/login", loadLeilao, async (req, res) => {
  if (loginRateLimiter.isLimited(req.ip)) {
    return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
  }
  const { password } = req.body || {};
  const hash = req.store.getState("adminSecretHash");
  if (!(await verifyPassword(password, hash))) {
    loginRateLimiter.record(req.ip);
    return res.status(401).json({ error: "Código incorreto ou expirado" });
  }
  // uso único -- some assim que alguém entra com ele, dono precisa gerar outro pra delegar de novo
  req.store.setState("adminSecretHash", null);
  grantAdminSession(req, res, req.leilaoId);
  res.json({ ok: true });
});

const MOD_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sem 0/O/1/I/L, mais fácil de ler/digitar
const MOD_CODE_LENGTH = 8;

function generateModCode() {
  let code = "";
  for (let i = 0; i < MOD_CODE_LENGTH; i++) {
    code += MOD_CODE_ALPHABET[crypto.randomInt(MOD_CODE_ALPHABET.length)];
  }
  return code;
}

// só o dono (via Twitch) pode gerar -- quem já tem acesso de apresentador
// por outro caminho não precisa de um código novo pra si mesmo
app.post("/api/l/:id/admin/generate-code", loadLeilao, async (req, res) => {
  const twitchSession = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  const isOwner = !!(twitchSession && meta && meta.ownerTwitchUserId && twitchSession.twitchUserId === meta.ownerTwitchUserId);
  if (!isOwner) {
    return res.status(401).json({ error: "Só o dono do leilão pode gerar um código" });
  }
  const code = generateModCode();
  req.store.setState("adminSecretHash", await hashPassword(code));
  res.json({ ok: true, code });
});

// derruba TODOS os moderadores atualmente conectados nesse leilão de uma
// vez (aumenta a versão -- cookies antigos de mod ficam com versão velha e
// param de bater em hasAdminSession), sem afetar o dono nem outros leilões.
// Não invalida código de uso único ainda não usado (esse já é resolvido
// separadamente ao gerar um novo)
app.post("/api/l/:id/admin/revoke-mod-sessions", loadLeilao, (req, res) => {
  const twitchSession = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  const isOwner = !!(twitchSession && meta && meta.ownerTwitchUserId && twitchSession.twitchUserId === meta.ownerTwitchUserId);
  if (!isOwner) {
    return res.status(401).json({ error: "Só o dono do leilão pode revogar acesso de moderadores" });
  }
  const currentVersion = req.store.getState("adminSessionVersion", 0);
  req.store.setState("adminSessionVersion", Number(currentVersion) + 1);
  res.json({ ok: true });
});

app.post("/api/l/:id/admin/logout", loadLeilao, (req, res) => {
  revokeAdminSession(req, res, req.leilaoId);
  res.json({ ok: true });
});

app.get("/api/l/:id/admin/check-session", loadLeilao, (req, res) => {
  const twitchSession = getTwitchSession(req);
  const meta = registry.getLeilaoMeta(req.leilaoId);
  const isOwner = !!(twitchSession && meta && meta.ownerTwitchUserId && twitchSession.twitchUserId === meta.ownerTwitchUserId);
  const isPresenter = isOwner || hasAdminSession(req, req.leilaoId);
  res.json({ isOwner, isPresenter });
});

app.get("/api/l/:id/admin/game-search", loadLeilao, requireLeilaoAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  const results = await getMediaAdapter(req.store).searchGames(q);
  res.json({ results });
});

app.post("/api/l/:id/admin/manual-entry", loadLeilao, requireLeilaoAdmin, async (req, res) => {
  const { name, amount, action, username } = req.body || {};
  if (!name || !amount || Number.isNaN(Number(amount))) {
    return res.status(400).json({ error: `Informe nome e valor` });
  }
  const { leilaoId, store } = req;
  let parsed = parseMessage(`${action === "remove" ? "-" : "+"}${name}`);
  if (!parsed) return res.status(400).json({ error: `Nome de ${mediaLabel(store)} inválido` });
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

  // sem reopen=true: lançamento manual não deve reabrir um leilão encerrado
  touchActivity(store);

  broadcastUpdate(leilaoId, store, {
    type: parsed.action,
    username: username || "admin",
    amount: Number(amount),
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
  });
  maybeFetchGameImage(leilaoId, store, game.key, game.name, needsImage);
  res.json({ ok: true, game });
});

app.post("/api/l/:id/admin/test-alert", loadLeilao, requireLeilaoAdmin, (req, res) => {
  io.to(req.leilaoId).emit("test-alert", {
    type: "add",
    username: "Doador de Teste",
    amount: 10,
    note: "Boa sorte no leilão!",
    voiceId: "1",
    game: { name: "Jogo de Teste" },
  });
  res.json({ ok: true });
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
  const recap = buildRecap(store);
  if (recap.totalGames > 0) store.archiveAuction(recap, { openRound: false });
  store.resetAll();
  broadcastUpdate(leilaoId, store, { type: "reset" });
  res.json({ ok: true });
});

// trocar de modalidade (jogos <-> filmes) muda a fonte de busca/capa (RAWG
// vs TMDB) -- misturar capa de jogo com item de filme no mesmo catálogo não
// faz sentido, então a troca sempre zera o leilão primeiro, igual o reset manual
app.post("/api/l/:id/admin/set-mode", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { mode } = req.body || {};
  if (!LEILAO_MODES.has(mode)) {
    return res.status(400).json({ error: "Modalidade inválida" });
  }
  const { store, leilaoId } = req;
  const currentMode = normalizeMode(store.getState("mode", "jogos"));
  if (mode === currentMode) {
    return res.json({ ok: true, mode, reset: false });
  }
  const recap = buildRecap(store);
  if (recap.totalGames > 0) store.archiveAuction(recap, { openRound: false });
  store.resetAll();
  store.setState("mode", mode);
  broadcastUpdate(leilaoId, store, { type: "reset" });
  res.json({ ok: true, mode, reset: true });
});

app.post("/api/l/:id/admin/toggle-open", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { open } = req.body || {};
  const { store, leilaoId } = req;
  store.setState("open", open ? "true" : "false");
  if (open) {
    touchActivity(store, true);
  } else {
    store.setState("paused", "false");
    // precisa rodar antes do snapshot: buildRecap lê lastAuctionDurationMs
    captureAuctionDuration(store);
    archiveOpenRoundSnapshot(store);
  }
  broadcastUpdate(leilaoId, store, { type: "toggle-open", open: !!open });
  res.json({ ok: true, open: !!open });
});

app.post("/api/l/:id/admin/toggle-timer-lock", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { locked } = req.body || {};
  const { store, leilaoId } = req;
  store.setState("timerLocked", locked ? "true" : "false");
  broadcastUpdate(leilaoId, store, { type: "toggle-timer-lock", locked: !!locked });
  res.json({ ok: true, locked: !!locked });
});

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

// não usa touchActivity aqui: isso resetaria lastActivityAt pra agora em vez de somar
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
  req.store.setState("title", title || "JogodaVez");
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

app.post("/api/l/:id/admin/qualify-count", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const count = Number(req.body && req.body.count);
  if (!Number.isFinite(count) || count < 1 || count > 20) {
    return res.status(400).json({ error: "Informe um número entre 1 e 20" });
  }
  req.store.setState("qualifyCount", Math.floor(count));
  broadcastUpdate(req.leilaoId, req.store, { type: "qualify-count" });
  res.json({ ok: true, count: Math.floor(count) });
});

app.post("/api/l/:id/admin/hide-total", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const hidden = !!(req.body && req.body.hidden);
  req.store.setState("hideTotalRaised", hidden ? "true" : "false");
  broadcastUpdate(req.leilaoId, req.store, { type: "hide-total" });
  res.json({ ok: true, hidden });
});

// chamado manual (não como middleware) pra devolver erro em JSON, não a página de erro padrão do Express
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
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

// ---------- socket.io ----------

io.on("connection", (socket) => {
  const leilaoId = socket.handshake.query.leilaoId;
  if (!leilaoId || !registry.leilaoExists(leilaoId)) return;
  socket.join(leilaoId);
  socket.emit("update", { leaderboard: serializeLeaderboard(getStore(leilaoId), leilaoId), lastEvent: null });
});

setInterval(() => {
  for (const leilaoId of registry.listLeilaoIds()) {
    const store = getStore(leilaoId);
    const isOpen = store.getState("open", "true") === "true";
    if (!isOpen) continue;
    if (store.getState("paused", "false") === "true") continue;
    const lastActivityAt = Number(store.getState("lastActivityAt", Date.now()));
    if (Date.now() - lastActivityAt >= getAutoCloseMs(store)) {
      store.setState("open", "false");
      captureAuctionDuration(store);
      archiveOpenRoundSnapshot(store);
      broadcastUpdate(leilaoId, store, { type: "auto-closed" });
    }
  }
}, 5000);

require("./src/stateBackup").start();
require("./src/reconciliation").start();

// ---------- start ----------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Leilão rodando em http://localhost:${PORT}`);
  console.log(`Criar um leilão em http://localhost:${PORT}/`);
});
