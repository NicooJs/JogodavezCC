require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const registry = require("./src/registry");
const pixggApi = require("./src/pixggApi");
const { getStore } = require("./src/stores");
const { verifyPassword } = require("./src/passwords");
const { parseMessage, normalizeKey } = require("./src/parser");
const livepix = require("./src/livepixClient");
const pixgg = require("./src/pixggClient");
const { fetchGameImage, searchGames, identifyGameFromNoisyText } = require("./src/gameImages");
const { fetchTwitchAvatar } = require("./src/twitchClient");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const DEFAULT_AUTO_CLOSE_MS = 5 * 60 * 1000; // 5 minutos sem atividade encerra sozinho

// O pix.gg manda um GET periódico na URL do webhook (ping de saúde, ver
// CLAUDE.md) bem mais frequente que isso — se a gente ficar esse tempo sem
// nenhum contato (nem GET nem POST válido), é sinal forte de que o webhook
// foi desvinculado do lado do pix.gg (ex: streamer regenerou o secret).
const WEBHOOK_STALE_MS = 5 * 60 * 1000;

function getAutoCloseMs(store) {
  const stored = Number(store.getState("timerDurationMs", DEFAULT_AUTO_CLOSE_MS));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_AUTO_CLOSE_MS;
}

// ---------- helpers ----------

function centsToNumber(cents) {
  return Math.round(cents) / 100;
}

// Marca "agora" como o último lance recebido (reinicia a contagem de 5 min).
// reopen=true também garante que o leilão volte a ficar aberto.
function touchActivity(store, reopen = false) {
  store.setState("lastActivityAt", String(Date.now()));
  if (reopen) store.setState("open", "true");
}

// Marca "agora" como o último contato de verdade do pix.gg nessa URL de
// webhook (GET de ping ou POST com assinatura válida) — usado só pra
// detectar desvinculação, ver WEBHOOK_STALE_MS e serializeLeaderboard.
function touchWebhookPing(store) {
  store.setState("lastWebhookPingAt", String(Date.now()));
}

function isWebhookStale(store) {
  const lastPing = Number(store.getState("lastWebhookPingAt", 0));
  const createdAt = new Date(store.getState("createdAt", new Date().toISOString())).getTime();
  const referenceTime = lastPing || createdAt; // sem ping ainda, conta desde a criação
  return Date.now() - referenceTime > WEBHOOK_STALE_MS;
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
    const existing = store.getGame(matchedKey);
    return { ...parsed, key: matchedKey, name: existing.name };
  }

  const rawgMatch = await identifyGameFromNoisyText(parsed.name);
  if (rawgMatch) {
    return { ...parsed, key: normalizeKey(rawgMatch.name), name: rawgMatch.name };
  }

  return parsed;
}

function serializeLeaderboard(store) {
  const rows = store.getLeaderboard();
  const isOpen = store.getState("open", "true") === "true";
  const isPaused = isOpen && store.getState("paused", "false") === "true";
  const lastActivityAt = Number(store.getState("lastActivityAt", Date.now()));
  const autoCloseMs = getAutoCloseMs(store);
  const items = rows.map((row, index) => ({
    key: row.key,
    name: row.name,
    total: centsToNumber(row.total_cents),
    rank: index + 1,
    winning: index < 3, // top 3 sempre destacado
    image: row.image_url || null,
  }));

  const donors = store.getTopDonors(10).map((d, index) => ({
    username: d.username,
    total: centsToNumber(d.total_cents),
    rank: index + 1,
  }));

  return {
    title: store.getState("title", "Leilão de Jogos"),
    host: store.getState("host", ""),
    hostAvatar: store.getState("hostAvatar", null),
    open: isOpen,
    paused: isPaused,
    items,
    donors,
    donorNames: store.getDonorNames(),
    totalRaised: centsToNumber(store.getTotalRaised()),
    timerEndsAt: isOpen && !isPaused ? lastActivityAt + autoCloseMs : null,
    timerRemainingMs: isPaused ? Number(store.getState("pausedRemainingMs", autoCloseMs)) : null,
    timerDurationMs: autoCloseMs,
    webhookStale: isWebhookStale(store),
  };
}

function broadcastUpdate(leilaoId, store, lastEvent) {
  io.to(leilaoId).emit("update", { leaderboard: serializeLeaderboard(store), lastEvent });
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

function requireLeilaoAdmin(req, res, next) {
  const supplied = req.header("x-admin-password") || "";
  const hash = req.store.getState("adminSecretHash");
  if (verifyPassword(supplied, hash)) return next();
  return res.status(401).json({ error: "Senha de admin inválida" });
}

async function processDonationMessage(leilaoId, store, { id, fallbackUsername, fallbackMessage, fallbackAmount }) {
  if (store.isAlreadyProcessed(id)) return;

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

// ---------- criação de leilão ----------

app.post("/api/leiloes", async (req, res) => {
  try {
    const { title, host, password, clientId, clientSecret } = req.body || {};
    const { id } = await registry.createLeilao({
      title,
      host,
      password,
      clientId,
      clientSecret,
      buildWebhookUrl: (leilaoId) => buildWebhookUrlFromReq(req, leilaoId),
    });
    res.json({ ok: true, id, url: `/l/${id}` });

    // Busca a foto da Twitch já na criação, sem precisar editar o nome do
    // host manualmente depois — mesmo padrão fire-and-forget da rota
    // /admin/host, só que aqui dispara sozinho.
    if (host) {
      const store = getStore(id);
      fetchTwitchAvatar(host)
        .then((avatarUrl) => {
          if (!avatarUrl || store.getState("host", "") !== host) return;
          store.setState("hostAvatar", avatarUrl);
          broadcastUpdate(id, store, null);
        })
        .catch((err) => console.error("Falha ao buscar avatar da Twitch na criação:", err.message));
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
  res.json(serializeLeaderboard(req.store));
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
// endpoint quebrado e não manda o POST de verdade da doação. Também serve
// de sinal de vida pro aviso de "webhook desvinculado" (ver isWebhookStale).
app.get("/webhook/pixgg/:leilaoId", (req, res) => {
  const leilaoId = req.params.leilaoId;
  if (/^[a-z0-9_-]+$/i.test(leilaoId) && registry.leilaoExists(leilaoId)) {
    touchWebhookPing(getStore(leilaoId));
  }
  res.sendStatus(200);
});

// Webhook do pix.gg — uma URL própria por leilão (vinculada automaticamente
// na aplicação do streamer no momento da criação, ver registry.createLeilao
// + pixggApi.setWebhookUrl). O :leilaoId na própria URL já diz de quem é a
// doação — não precisa mais casar por streamerUsername no corpo.
app.post("/webhook/pixgg/:leilaoId", (req, res) => {
  res.sendStatus(200); // confirma recebimento primeiro

  try {
    const secret = process.env.PIXGG_WEBHOOK_SECRET || "";
    if (!pixgg.verifySignature(req.query.assinatura, secret)) {
      console.warn("Webhook pix.gg ignorado: assinatura inválida");
      return;
    }

    const leilaoId = req.params.leilaoId;
    if (!/^[a-z0-9_-]+$/i.test(leilaoId) || !registry.leilaoExists(leilaoId)) {
      console.warn(`Webhook pix.gg: leilão "${leilaoId}" não encontrado, ignorando.`);
      return;
    }
    touchWebhookPing(getStore(leilaoId));

    const donation = pixgg.parseDonation(req.body);
    if (!pixgg.isPaid(donation.status)) return; // ignora o "created", só conta o "paid"

    const store = getStore(leilaoId);
    processDonationMessage(leilaoId, store, {
      id: donation.id,
      fallbackUsername: donation.username,
      fallbackMessage: donation.message,
      fallbackAmount: donation.amountCents,
    });
  } catch (err) {
    console.error("Erro ao processar webhook do pix.gg:", err.message);
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

  broadcastUpdate(leilaoId, store, {
    type: parsed.action,
    username: username || "admin",
    amount: Number(amount),
    game: { key: game.key, name: game.name, total: centsToNumber(game.total_cents) },
  });

  touchActivity(store, true);
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
  req.store.resetAll();
  broadcastUpdate(req.leilaoId, req.store, { type: "reset" });
  res.json({ ok: true });
});

app.post("/api/l/:id/admin/toggle-open", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { open } = req.body || {};
  const { store, leilaoId } = req;
  store.setState("open", open ? "true" : "false");
  if (open) touchActivity(store); // reabrir dá um fôlego novo
  else store.setState("paused", "false"); // encerrar limpa qualquer pausa pendente
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

app.post("/api/l/:id/admin/reset-timer", loadLeilao, requireLeilaoAdmin, (req, res) => {
  touchActivity(req.store, true);
  broadcastUpdate(req.leilaoId, req.store, { type: "timer-reset" });
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

app.post("/api/l/:id/admin/host", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { host } = req.body || {};
  const name = host || "";
  const { store, leilaoId } = req;
  store.setState("host", name);
  store.setState("hostAvatar", "");
  broadcastUpdate(leilaoId, store, { type: "host" });
  res.json({ ok: true });

  if (!name) return;
  fetchTwitchAvatar(name)
    .then((avatarUrl) => {
      if (!avatarUrl || store.getState("host", "") !== name) return;
      store.setState("hostAvatar", avatarUrl);
      broadcastUpdate(leilaoId, store, null);
    })
    .catch((err) => console.error("Falha ao buscar avatar da Twitch:", err.message));
});

app.post("/api/l/:id/admin/title", loadLeilao, requireLeilaoAdmin, (req, res) => {
  const { title } = req.body || {};
  req.store.setState("title", title || "Leilão de Jogos");
  broadcastUpdate(req.leilaoId, req.store, { type: "title" });
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
    await pixggApi.setWebhookUrl(clientId, clientSecret, buildWebhookUrlFromReq(req, req.leilaoId));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- estáticos ----------
// Depois das rotas de página (/, /l/:id, /l/:id/admin) pra elas terem
// prioridade; os arquivos de public/ (css, js, board.html, admin.html
// direto) continuam acessíveis por trás.
app.use(express.static(path.join(__dirname, "public")));

// ---------- socket.io ----------

io.on("connection", (socket) => {
  const leilaoId = socket.handshake.query.leilaoId;
  if (!leilaoId || !registry.leilaoExists(leilaoId)) return;
  socket.join(leilaoId);
  socket.emit("update", { leaderboard: serializeLeaderboard(getStore(leilaoId)), lastEvent: null });
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
