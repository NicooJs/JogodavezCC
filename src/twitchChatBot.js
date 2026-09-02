const tmi = require("tmi.js");
const { findExistingGameInText } = require("./parser");

// bot compartilhado, só leitura -- conecta anônimo (sem identity/token),
// nenhuma autorização por streamer é necessária pra LER o chat público.
// !hype nome do jogo dá 1 like no lote correspondente; a cada 10 likes
// server.js dispara a animação de fogo via broadcastUpdate (ver init()).
// Sem aspas de propósito (2026-09-02, corrigido): exigir aspas literais
// era inútil, nenhum viewer digita `!hype "Elden Ring"` de verdade no
// chat -- captura o resto da mensagem cru e deixa findExistingGameInText
// (mesmo fuzzy match já usado na doação por texto livre) achar o jogo,
// tolerando erro de digitação e palavras extras em volta.
const HYPE_PATTERN = /^!hype\s+(.+)$/i;
const HYPE_COOLDOWN_MS = 10 * 60 * 1000; // 1 hype por espectador a cada 10min, qualquer jogo

let client = null;
let getStoreFn = null;
let onHypeAccepted = null;
const channelToLeilaoId = new Map(); // twitch login (lowercase, sem #) -> leilaoId
const lastHypeAt = new Map(); // `${viewerId}:${leilaoId}` -> timestamp do último hype aceito

// log temporário de diagnóstico (2026-09-02) -- só imprime pra mensagem
// que já bate o prefixo !hype, então não polui o log com chat normal.
// Tirar depois de confirmar que o fluxo tá funcionando ponta a ponta em
// produção (cliente reportou !hype não registrando, nenhum erro nos
// logs até agora -- precisa ver em qual passo trava de verdade).
function logHype(...args) {
  console.log("[twitch-chat-bot]", ...args);
}

function connect(channels) {
  client = new tmi.Client({ channels });
  client.on("connected", (addr, port) => logHype("conectado:", addr, port, "| canais:", channels.join(", ")));
  client.on("disconnected", (reason) => logHype("desconectado:", reason));
  client.on("message", handleMessage);
  client.connect().catch((err) => console.error("[twitch-chat-bot] erro ao conectar:", err.message));
}

function handleMessage(channel, tags, message, self) {
  if (self) return;
  const match = HYPE_PATTERN.exec(message.trim());
  if (!match) return;
  logHype(`mensagem recebida em ${channel} de ${tags.username}:`, JSON.stringify(message));

  const login = channel.replace(/^#/, "").toLowerCase();
  const leilaoId = channelToLeilaoId.get(login);
  if (!leilaoId) return logHype(`canal ${login} não tem leilaoId mapeado, ignorando`);

  const viewerId = tags["user-id"] || tags.username;
  if (!viewerId) return logHype("sem viewerId (user-id/username), ignorando");
  const cooldownKey = `${viewerId}:${leilaoId}`;
  const now = Date.now();
  const lastAt = lastHypeAt.get(cooldownKey);
  if (lastAt && now - lastAt < HYPE_COOLDOWN_MS) {
    return logHype(`${viewerId} em cooldown ainda (faltam ${Math.ceil((HYPE_COOLDOWN_MS - (now - lastAt)) / 1000)}s)`);
  }

  const store = getStoreFn(leilaoId);
  const existingGames = store.getLeaderboard().map((g) => ({ key: g.key, name: g.name }));
  const matched = findExistingGameInText(match[1], existingGames);
  if (!matched) return logHype(`"${match[1]}" não bateu com nenhum jogo do catálogo (${existingGames.map((g) => g.key).join(", ")})`);

  const likes = store.likeGame(matched.key);
  if (likes == null) return logHype(`likeGame(${matched.key}) retornou null, jogo sumiu?`);
  lastHypeAt.set(cooldownKey, now);
  logHype(`hype aceito: ${matched.name} (${leilaoId}), likes agora = ${likes}`);
  onHypeAccepted?.(leilaoId, store, { key: matched.key, name: matched.name, likes });
}

// chamado uma vez no boot do server.js -- junta todos os leilões que já
// têm um dono com Twitch vinculado (hostTwitchLogin fica no state de cada
// store, não no registry) e conecta num client tmi.js só, várias salas.
function init({ getStore, registry, onHypeAccepted: callback }) {
  getStoreFn = getStore;
  onHypeAccepted = callback;

  // uma conta Twitch pode ter mais de 1 leilão no registro (resíduo de
  // leilão antigo desvinculado, por exemplo) -- só o mais recente entra
  // no chat, mesmo critério já usado em outros lugares pra escolher "o
  // leilão representante" de uma conta (Perfil, link do widget OBS).
  // Agrupa por ownerTwitchUserId usando o REGISTRO (createdAt sempre
  // confiável ali, escrito na criação do leilão) -- não a cópia
  // espelhada de createdAt no state de cada leilão, que pode faltar num
  // leilão antigo o suficiente (bug real visto em produção: desempatar
  // pela cópia no state escolhia um leilão vazio e órfão só porque o
  // leilão de verdade, mais antigo, sem essa cópia, sempre perdia a
  // comparação contra uma string vazia).
  const bestByOwner = new Map(); // ownerTwitchUserId -> { leilaoId, createdAt }
  for (const leilaoId of registry.listLeilaoIds()) {
    const meta = registry.getLeilaoMeta(leilaoId);
    if (!meta || !meta.ownerTwitchUserId) continue;
    const current = bestByOwner.get(meta.ownerTwitchUserId);
    if (!current || meta.createdAt > current.createdAt) {
      bestByOwner.set(meta.ownerTwitchUserId, { leilaoId, createdAt: meta.createdAt });
    }
  }

  const channels = [];
  for (const { leilaoId, createdAt } of bestByOwner.values()) {
    const login = getStore(leilaoId).getState("hostTwitchLogin", null);
    if (!login) continue;
    const normalized = login.toLowerCase();
    channelToLeilaoId.set(normalized, leilaoId);
    channels.push(normalized);
    logHype(`canal #${normalized} -> leilaoId ${leilaoId} (createdAt ${createdAt})`);
  }

  logHype(`boot: ${channels.length} canal(is) com Twitch vinculado -- ${channels.join(", ") || "(nenhum)"}`);
  if (channels.length) connect(channels);
}

// chamado toda vez que um leilão novo é criado (server.js, POST /api/leiloes)
// -- entra no canal na hora, sem esperar reiniciar o processo.
function registerChannel(leilaoId, twitchLogin) {
  if (!twitchLogin) return;
  const normalized = twitchLogin.toLowerCase();
  channelToLeilaoId.set(normalized, leilaoId);

  if (!client) return connect([normalized]);
  client.join(normalized).catch((err) => console.error(`[twitch-chat-bot] erro ao entrar em #${normalized}:`, err.message));
}

module.exports = { init, registerChannel };
