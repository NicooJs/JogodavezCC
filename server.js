require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const db = require("./src/db");
const { parseMessage } = require("./src/parser");
const livepix = require("./src/livepixClient");
const pixgg = require("./src/pixggClient");
const { fetchGameImage, searchGames } = require("./src/gameImages");
const { fetchTwitchAvatar } = require("./src/twitchClient");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const AUCTION_TITLE = process.env.AUCTION_TITLE || "Leilão de Jogos";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DEFAULT_AUTO_CLOSE_MS = 5 * 60 * 1000; // 5 minutos sem atividade encerra sozinho

// O streamer pode alongar essa janela pelo modo apresentador (ver
// /api/admin/set-timer); guardado no state pra sobreviver a restart/deploy.
function getAutoCloseMs() {
  const stored = Number(db.getState("timerDurationMs", DEFAULT_AUTO_CLOSE_MS));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_AUTO_CLOSE_MS;
}

// ---------- helpers ----------

function centsToNumber(cents) {
  return Math.round(cents) / 100;
}

// Marca "agora" como o último lance recebido (reinicia a contagem de 5 min).
// reopen=true também garante que o leilão volte a ficar aberto.
function touchActivity(reopen = false) {
  db.setState("lastActivityAt", String(Date.now()));
  if (reopen) db.setState("open", "true");
}

// Se a chave já existe, usa ela direto. Senão, tenta casar com um jogo já
// existente no catálogo (ruído na mensagem ou erro de digitação — ver
// resolveExistingKey em db.js) antes de decidir que é um lote novo.
function resolveParsedGame(parsed) {
  if (db.hasGame(parsed.key)) return parsed;
  const matchedKey = db.resolveExistingKey(parsed.key);
  if (!matchedKey) return parsed;
  const existing = db.getGame(matchedKey);
  return { ...parsed, key: matchedKey, name: existing.name };
}

function serializeLeaderboard() {
  const rows = db.getLeaderboard();
  const isOpen = db.getState("open", "true") === "true";
  const isPaused = isOpen && db.getState("paused", "false") === "true";
  const lastActivityAt = Number(db.getState("lastActivityAt", Date.now()));
  const autoCloseMs = getAutoCloseMs();
  const items = rows.map((row, index) => ({
    key: row.key,
    name: row.name,
    total: centsToNumber(row.total_cents),
    rank: index + 1,
    winning: index < 3, // top 3 sempre destacado
    image: row.image_url || null,
  }));

  const donors = db.getTopDonors(10).map((d, index) => ({
    username: d.username,
    total: centsToNumber(d.total_cents),
    rank: index + 1,
  }));

  return {
    title: db.getState("title", AUCTION_TITLE),
    host: db.getState("host", ""),
    hostAvatar: db.getState("hostAvatar", null),
    open: isOpen,
    paused: isPaused,
    items,
    donors,
    donorNames: db.getDonorNames(),
    totalRaised: centsToNumber(db.getTotalRaised()),
    timerEndsAt: isOpen && !isPaused ? lastActivityAt + autoCloseMs : null,
    timerRemainingMs: isPaused ? Number(db.getState("pausedRemainingMs", autoCloseMs)) : null,
    timerDurationMs: autoCloseMs,
  };
}

function broadcastUpdate(lastEvent) {
  io.emit("update", { leaderboard: serializeLeaderboard(), lastEvent });
}

// Roda em segundo plano: não atrasa a resposta do webhook nem do formulário.
// Quando a imagem chega, manda uma atualização nova pro placar. Tenta de novo
// sempre que o jogo ainda não tem capa (jogo novo, ou capa que falhou antes
// por falta de chave/erro passageiro da RAWG).
function maybeFetchGameImage(key, name, needsImage) {
  if (!needsImage) return;
  fetchGameImage(name)
    .then((imageUrl) => {
      if (!imageUrl) return;
      db.setGameImage(key, imageUrl);
      broadcastUpdate(null);
    })
    .catch((err) => console.error("Falha ao buscar imagem do jogo:", err.message));
}

function requireAdmin(req, res, next) {
  const supplied = req.header("x-admin-password") || "";
  if (!ADMIN_PASSWORD || supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Senha de admin inválida" });
  }
  next();
}

async function processDonationMessage({ id, fallbackUsername, fallbackMessage, fallbackAmount }) {
  if (db.isAlreadyProcessed(id)) return;

  let username = fallbackUsername;
  let message = fallbackMessage;
  let amountCents = fallbackAmount;

  // Se não veio detalhe (fluxo normal do webhook), busca na API
  if (message === undefined) {
    const details = await livepix.fetchMessage(id);
    username = details.username;
    message = details.message;
    amountCents = details.amount; // já vem em centavos
  }

  const isOpen = db.getState("open", "true") === "true";
  if (!isOpen) {
    db.logUnparsedEvent({ amountCents, username, rawMessage: message, livepixId: id });
    broadcastUpdate({ type: "closed", username, amount: centsToNumber(amountCents), message });
    return;
  }

  let parsed = parseMessage(message);
  if (!parsed) {
    db.logUnparsedEvent({ amountCents, username, rawMessage: message, livepixId: id });
    broadcastUpdate({
      type: "ignored",
      username,
      amount: centsToNumber(amountCents),
      message,
    });
    return;
  }
  parsed = resolveParsedGame(parsed);

  const needsImage = !db.hasGame(parsed.key) || !db.hasGameImage(parsed.key);

  const game = db.applyContribution({
    key: parsed.key,
    name: parsed.name,
    action: parsed.action,
    amountCents,
    username,
    rawMessage: message,
    livepixId: id,
  });

  broadcastUpdate({
    type: parsed.action,
    username,
    amount: centsToNumber(amountCents),
    message,
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
  });

  touchActivity();
  maybeFetchGameImage(game.key, game.name, needsImage);
}

// ---------- rotas públicas ----------

app.get("/api/leaderboard", (req, res) => {
  res.json(serializeLeaderboard());
});

app.get("/api/events/recent", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const events = db.getRecentEvents(limit).map((e) => ({
    ...e,
    amount: centsToNumber(e.amount_cents),
  }));
  res.json({ events });
});

// Webhook do LivePix. Ele manda só {resource:{id, type}} — respondemos rápido
// e processamos os detalhes em seguida, chamando a API de volta.
app.post("/webhook/livepix", async (req, res) => {
  res.sendStatus(200); // confirma recebimento primeiro, como a doc pede

  try {
    const resource = req.body && req.body.resource;
    if (!resource || resource.type !== "message") return;
    await processDonationMessage({ id: resource.id });
  } catch (err) {
    console.error("Erro ao processar webhook do LivePix:", err.message);
  }
});

// Webhook do pix.gg — diferente do LivePix: manda os dados da doação já no
// corpo (doador, valor, status, mensagem), então não precisamos chamar a API
// de volta. Sem assinatura em header: a proteção é o segredo na própria URL
// (?assinatura=xxxx, combinado com o pix.gg — ver PIXGG_WEBHOOK_SECRET).
// Cada transação manda dois webhooks (created, depois paid); só o "paid" é
// contabilizado.
app.post("/webhook/pixgg", (req, res) => {
  res.sendStatus(200); // confirma recebimento primeiro

  try {
    const secret = process.env.PIXGG_WEBHOOK_SECRET || "";
    if (!pixgg.verifySignature(req.query.assinatura, secret)) {
      console.warn("Webhook pix.gg ignorado: assinatura inválida");
      return;
    }

    const donation = pixgg.parseDonation(req.body);
    if (!pixgg.isPaid(donation.status)) return; // ignora o "created", só conta o "paid"

    // Ponto multi-streamer: hoje null (leilão único da Sabrinoca). Quando abrir
    // pra vários, identifyStreamer devolve o streamerUsername do pix.gg e a
    // gente roteia por aqui pra escolher o leilão certo.
    const streamer = pixgg.identifyStreamer(req.body);
    void streamer; // TODO multi-tenant: usar pra escolher o leilão certo

    // Dados já vêm no corpo → passamos direto, sem chamar API nenhuma.
    processDonationMessage({
      id: donation.id,
      fallbackUsername: donation.username,
      fallbackMessage: donation.message,
      fallbackAmount: donation.amountCents,
    });
  } catch (err) {
    console.error("Erro ao processar webhook do pix.gg:", err.message);
  }
});

// ---------- rotas de admin ----------

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Senha incorreta" });
  }
  res.json({ ok: true });
});

app.get("/api/admin/game-search", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  const results = await searchGames(q);
  res.json({ results });
});

app.post("/api/admin/manual-entry", requireAdmin, (req, res) => {
  const { name, amount, action, username } = req.body || {};
  if (!name || !amount || Number.isNaN(Number(amount))) {
    return res.status(400).json({ error: "Informe name e amount" });
  }
  let parsed = parseMessage(`${action === "remove" ? "-" : "+"}${name}`);
  if (!parsed) return res.status(400).json({ error: "Nome de jogo inválido" });
  parsed = resolveParsedGame(parsed);

  const needsImage = !db.hasGame(parsed.key) || !db.hasGameImage(parsed.key);

  const game = db.applyContribution({
    key: parsed.key,
    name: parsed.name,
    action: parsed.action,
    amountCents: Math.round(Number(amount) * 100),
    username: username || "admin (manual)",
    rawMessage: `[lançamento manual] ${name}`,
    livepixId: null,
  });

  broadcastUpdate({
    type: parsed.action,
    username: username || "admin",
    amount: Number(amount),
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
  });

  touchActivity(true);
  maybeFetchGameImage(game.key, game.name, needsImage);
  res.json({ ok: true, game });
});

app.post("/api/admin/adjust", requireAdmin, (req, res) => {
  const { key, deltaAmount } = req.body || {};
  const game = db.adjustGame(key, Math.round(Number(deltaAmount) * 100));
  if (!game) return res.status(404).json({ error: "Jogo não encontrado" });
  broadcastUpdate({ type: "adjust", game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) } });
  res.json({ ok: true, game });
});

app.post("/api/admin/set-total", requireAdmin, (req, res) => {
  const { key, total } = req.body || {};
  const game = db.setGameTotal(key, Math.round(Number(total) * 100));
  if (!game) return res.status(404).json({ error: "Jogo não encontrado" });
  broadcastUpdate({ type: "adjust", game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) } });
  res.json({ ok: true, game });
});

app.post("/api/admin/rename", requireAdmin, (req, res) => {
  const { key, newName } = req.body || {};
  const game = db.renameGame(key, newName);
  broadcastUpdate({ type: "rename" });
  res.json({ ok: true, game });
});

app.post("/api/admin/merge", requireAdmin, (req, res) => {
  const { fromKey, toKey, useNameFrom } = req.body || {};
  const game = db.mergeGames(fromKey, toKey, !!useNameFrom);
  if (!game) return res.status(404).json({ error: "Jogo(s) não encontrado(s)" });
  broadcastUpdate({ type: "merge" });
  res.json({ ok: true, game });
});

app.post("/api/admin/add-game", requireAdmin, (req, res) => {
  const { name } = req.body || {};
  const parsed = parseMessage(`+${name}`);
  if (!parsed) return res.status(400).json({ error: "Nome inválido" });
  const wasNew = !db.hasGame(parsed.key);
  const game = db.addManualGame(parsed.name, parsed.key, 0);
  broadcastUpdate({ type: "manual" });
  maybeFetchGameImage(game.key, game.name, wasNew);
  res.json({ ok: true, game });
});

app.delete("/api/admin/game/:key", requireAdmin, (req, res) => {
  db.deleteGame(req.params.key);
  broadcastUpdate({ type: "delete" });
  res.json({ ok: true });
});

app.post("/api/admin/reset", requireAdmin, (req, res) => {
  db.resetAll();
  broadcastUpdate({ type: "reset" });
  res.json({ ok: true });
});

app.post("/api/admin/toggle-open", requireAdmin, (req, res) => {
  const { open } = req.body || {};
  db.setState("open", open ? "true" : "false");
  if (open) touchActivity(); // reabrir dá um fôlego novo de 5 min
  else db.setState("paused", "false"); // encerrar limpa qualquer pausa pendente
  broadcastUpdate({ type: "toggle-open", open: !!open });
  res.json({ ok: true, open: !!open });
});

// Pausa/retoma só o timer de inatividade (o leilão continua aberto e
// aceitando doações normalmente) — diferente de encerrar, que é definitivo
// até reabrir manual. Ao retomar, volta exatamente com o tempo que faltava.
app.post("/api/admin/pause", requireAdmin, (req, res) => {
  const { paused } = req.body || {};
  const isOpen = db.getState("open", "true") === "true";
  if (!isOpen) return res.status(400).json({ error: "O leilão está encerrado, não dá pra pausar" });

  const autoCloseMs = getAutoCloseMs();
  if (paused) {
    const lastActivityAt = Number(db.getState("lastActivityAt", Date.now()));
    const remaining = Math.max(0, lastActivityAt + autoCloseMs - Date.now());
    db.setState("pausedRemainingMs", Math.round(remaining));
    db.setState("paused", "true");
  } else {
    const remaining = Number(db.getState("pausedRemainingMs", autoCloseMs));
    db.setState("lastActivityAt", String(Date.now() - (autoCloseMs - remaining)));
    db.setState("paused", "false");
  }
  broadcastUpdate({ type: "pause", paused: !!paused });
  res.json({ ok: true, paused: !!paused });
});

app.post("/api/admin/reset-timer", requireAdmin, (req, res) => {
  touchActivity(true);
  broadcastUpdate({ type: "timer-reset" });
  res.json({ ok: true });
});

// Deixa o streamer escolher quantos minutos sem atividade encerram o leilão
// (padrão 5). Já reinicia a contagem do zero com a duração nova.
app.post("/api/admin/set-timer", requireAdmin, (req, res) => {
  const minutes = Number(req.body && req.body.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 180) {
    return res.status(400).json({ error: "Informe um número de minutos entre 1 e 180" });
  }
  db.setState("timerDurationMs", Math.round(minutes * 60 * 1000));
  touchActivity(true);
  broadcastUpdate({ type: "timer-reset" });
  res.json({ ok: true, minutes });
});

app.post("/api/admin/host", requireAdmin, (req, res) => {
  const { host } = req.body || {};
  const name = host || "";
  db.setState("host", name);
  db.setState("hostAvatar", "");
  broadcastUpdate({ type: "host" });
  res.json({ ok: true });

  if (!name) return;
  fetchTwitchAvatar(name)
    .then((avatarUrl) => {
      if (!avatarUrl || db.getState("host", "") !== name) return;
      db.setState("hostAvatar", avatarUrl);
      broadcastUpdate(null);
    })
    .catch((err) => console.error("Falha ao buscar avatar da Twitch:", err.message));
});

app.post("/api/admin/title", requireAdmin, (req, res) => {
  const { title } = req.body || {};
  db.setState("title", title || AUCTION_TITLE);
  broadcastUpdate({ type: "title" });
  res.json({ ok: true });
});

// Ajuda a registrar o webhook automaticamente no LivePix usando PUBLIC_URL do .env
app.post("/api/admin/setup-webhook", requireAdmin, async (req, res) => {
  try {
    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) {
      return res.status(400).json({ error: "Configure PUBLIC_URL no .env primeiro" });
    }
    const webhook = await livepix.registerWebhook(`${publicUrl.replace(/\/$/, "")}/webhook/livepix`);
    res.json({ ok: true, webhook });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- socket.io ----------

io.on("connection", (socket) => {
  socket.emit("update", { leaderboard: serializeLeaderboard(), lastEvent: null });
});

// Confere a cada 5s se passou o tempo sem atividade e encerra sozinho.
// Uma vez fechado, fica fechado até o streamer reabrir manualmente
// (não reabre sozinho com uma doação nova).
setInterval(() => {
  const isOpen = db.getState("open", "true") === "true";
  if (!isOpen) return;
  if (db.getState("paused", "false") === "true") return; // pausado não conta o tempo
  const lastActivityAt = Number(db.getState("lastActivityAt", Date.now()));
  if (Date.now() - lastActivityAt >= getAutoCloseMs()) {
    db.setState("open", "false");
    broadcastUpdate({ type: "auto-closed" });
  }
}, 5000);

// ---------- start ----------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Leilão rodando em http://localhost:${PORT}`);
  console.log(`Painel admin em http://localhost:${PORT}/admin.html`);
});
