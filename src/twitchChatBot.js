const tmi = require("tmi.js");
const { findExistingGameInText } = require("./parser");

// bot compartilhado -- LER o chat público sempre foi anônimo (sem
// identity/token), nenhuma autorização por streamer é necessária pra
// isso. ESCREVER (avisar cooldown, ver replyCooldown/canReply abaixo) é
// opcional, só liga se TWITCH_BOT_USERNAME/TWITCH_BOT_OAUTH_TOKEN
// existirem -- sem eles, continua puro leitura como sempre foi.
// !hype nome do jogo dá 1 like no lote correspondente; a cada 5 likes
// server.js dispara a animação de fogo via broadcastUpdate (ver init()).
// !dislike nome do jogo é o irmão negativo -- mesma mecânica, contador
// separado (dislikes), sem nenhum efeito visual no CARD do board (só o
// contador, pedido explícito do cliente) -- mas participa igual do
// !hype na confirmação/cooldown no chat (ver replyConfirmation/
// replyCooldown abaixo).
// Sem aspas de propósito (2026-09-02, corrigido): exigir aspas literais
// era inútil, nenhum viewer digita `!hype "Elden Ring"` de verdade no
// chat -- captura o resto da mensagem cru e deixa findExistingGameInText
// (mesmo fuzzy match já usado na doação por texto livre) achar o jogo,
// tolerando erro de digitação e palavras extras em volta. Mesma lógica
// vale pro !dislike.
const REACTIONS = {
  hype: { pattern: /^!hype\s+(.+)$/i, storeMethod: "likeGame", cooldownMap: new Map(), replyThrottle: new Map() },
  dislike: { pattern: /^!dislike\s+(.+)$/i, storeMethod: "dislikeGame", cooldownMap: new Map(), replyThrottle: new Map() },
};
const REACTION_COOLDOWN_MS = 5 * 60 * 1000; // 1 reação por tipo por espectador a cada 5min (era 10), qualquer jogo
// aviso de cooldown no chat não repete a cada tentativa (viewer insistindo
// !hype/!hype/!hype enquanto ainda em cooldown spammaria o bot) -- só
// responde de novo pro mesmo viewer depois desse intervalo
const COOLDOWN_REPLY_THROTTLE_MS = 30 * 1000;

// bot só ganha permissão de ESCREVER no chat (avisar cooldown) se as duas
// variáveis abaixo existirem -- sem elas, continua 100% leitura como
// sempre foi, sem nenhuma mudança de comportamento. TWITCH_BOT_USERNAME é
// o login da conta do bot, TWITCH_BOT_OAUTH_TOKEN é um token no formato
// "oauth:xxxx" com escopo chat:edit pra essa conta -- não é algo que o
// servidor consegue gerar sozinho, precisa de autorização manual da conta
// do bot na Twitch (feito fora daqui, uma vez).
const canReply = !!(process.env.TWITCH_BOT_USERNAME && process.env.TWITCH_BOT_OAUTH_TOKEN);

let client = null;
let getStoreFn = null;
let onHypeAccepted = null;
let onDislikeAccepted = null;
const channelToLeilaoId = new Map(); // twitch login (lowercase, sem #) -> leilaoId

// log temporário de diagnóstico (2026-09-02) -- só imprime pra mensagem
// que já bate o prefixo !hype, então não polui o log com chat normal.
// Tirar depois de confirmar que o fluxo tá funcionando ponta a ponta em
// produção (cliente reportou !hype não registrando, nenhum erro nos
// logs até agora -- precisa ver em qual passo trava de verdade).
function logHype(...args) {
  console.log("[twitch-chat-bot]", ...args);
}

function connect(channels) {
  const options = { channels };
  if (canReply) {
    options.identity = { username: process.env.TWITCH_BOT_USERNAME, password: process.env.TWITCH_BOT_OAUTH_TOKEN };
  }
  client = new tmi.Client(options);
  client.on("connected", (addr, port) =>
    logHype("conectado:", addr, port, "| canais:", channels.join(", "), "| modo:", canReply ? "leitura+escrita" : "só leitura")
  );
  client.on("disconnected", (reason) => logHype("desconectado:", reason));
  client.on("message", handleMessage);
  client.connect().catch((err) => console.error("[twitch-chat-bot] erro ao conectar:", err.message));
}

// precisão em segundos (pedido explícito do cliente) -- 1 mensagem só na
// tentativa bloqueada, não uma contagem regressiva mensagem-a-mensagem
// (isso spammaria o chat e esbarraria no limite de mensagens da Twitch).
function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}min` : `${minutes}min${seconds}s`;
}

function handleMessage(channel, tags, message, self) {
  if (self) return;
  const trimmed = message.trim();

  for (const [kind, reaction] of Object.entries(REACTIONS)) {
    const match = reaction.pattern.exec(trimmed);
    if (!match) continue;
    return handleReaction(kind, reaction, match[1], channel, tags);
  }
}

function handleReaction(kind, reaction, gameText, channel, tags) {
  logHype(`mensagem !${kind} recebida em ${channel} de ${tags.username}:`, JSON.stringify(gameText));

  const login = channel.replace(/^#/, "").toLowerCase();
  const leilaoId = channelToLeilaoId.get(login);
  if (!leilaoId) return logHype(`canal ${login} não tem leilaoId mapeado, ignorando`);

  const viewerId = tags["user-id"] || tags.username;
  if (!viewerId) return logHype("sem viewerId (user-id/username), ignorando");
  const cooldownKey = `${viewerId}:${leilaoId}`;
  const now = Date.now();
  const lastAt = reaction.cooldownMap.get(cooldownKey);
  if (lastAt && now - lastAt < REACTION_COOLDOWN_MS) {
    const remainingMs = REACTION_COOLDOWN_MS - (now - lastAt);
    logHype(`${viewerId} em cooldown ainda pro !${kind} (faltam ${Math.ceil(remainingMs / 1000)}s)`);
    return replyCooldown(reaction, kind, channel, tags, cooldownKey, remainingMs, now);
  }

  const store = getStoreFn(leilaoId);
  const existingGames = store.getLeaderboard().map((g) => ({ key: g.key, name: g.name }));
  const matched = findExistingGameInText(gameText, existingGames);
  if (!matched) return logHype(`"${gameText}" não bateu com nenhum jogo do catálogo (${existingGames.map((g) => g.key).join(", ")})`);

  const count = store[reaction.storeMethod](matched.key);
  if (count == null) return logHype(`${reaction.storeMethod}(${matched.key}) retornou null, jogo sumiu?`);
  reaction.cooldownMap.set(cooldownKey, now);
  logHype(`!${kind} aceito: ${matched.name} (${leilaoId}), contador agora = ${count}`);
  replyConfirmation(kind, channel, tags, matched.name, count);

  const by = tags["display-name"] || tags.username;
  if (kind === "hype") onHypeAccepted?.(leilaoId, store, { key: matched.key, name: matched.name, likes: count, by });
  else onDislikeAccepted?.(leilaoId, store, { key: matched.key, name: matched.name, dislikes: count, by });
}

// confirmação de sucesso (pedido explícito do cliente) -- dispara em TODO
// !hype/!dislike aceito, não só na tentativa bloqueada. Diferente de
// replyCooldown, não precisa de throttle próprio: o cooldown da própria
// reação (REACTION_COOLDOWN_MS) já impede a MESMA pessoa de gerar 2
// confirmações em sequência -- só não impede várias PESSOAS diferentes
// gerando várias mensagens seguidas se o jogo estiver bombando, o que é
// esperado e aceito.
function replyConfirmation(kind, channel, tags, gameName, count) {
  if (!canReply) return;
  const mention = tags.username;
  client
    .say(channel, `@${mention} ${kind} dado em ${gameName}! (${count} no total)`)
    .catch((err) => console.error(`[twitch-chat-bot] erro ao confirmar !${kind} em ${channel}:`, err.message));
}

// só existe efeito se canReply (bot com identidade própria, ver connect())
// -- sem isso, client.say nem existe direito (client conectado anônimo não
// consegue escrever, tmi.js rejeitaria a chamada). Throttle por
// viewer+tipo pra não spammar o chat se alguém insistir no comando várias
// vezes seguidas enquanto ainda em cooldown.
function replyCooldown(reaction, kind, channel, tags, cooldownKey, remainingMs, now) {
  if (!canReply) return;
  const lastReplyAt = reaction.replyThrottle.get(cooldownKey);
  if (lastReplyAt && now - lastReplyAt < COOLDOWN_REPLY_THROTTLE_MS) return;
  reaction.replyThrottle.set(cooldownKey, now);
  const mention = tags.username;
  client
    .say(channel, `@${mention} calma, ainda faltam ${formatRemaining(remainingMs)} pro próximo !${kind}.`)
    .catch((err) => console.error(`[twitch-chat-bot] erro ao responder cooldown em ${channel}:`, err.message));
}

// chamado uma vez no boot do server.js -- junta todos os leilões que já
// têm um dono com Twitch vinculado (hostTwitchLogin fica no state de cada
// store, não no registry) e conecta num client tmi.js só, várias salas.
function init({ getStore, registry, onHypeAccepted: hypeCallback, onDislikeAccepted: dislikeCallback }) {
  getStoreFn = getStore;
  onHypeAccepted = hypeCallback;
  onDislikeAccepted = dislikeCallback;

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
