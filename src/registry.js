// Registro pequeno e separado dos dados de cada leilão: só o necessário pra
// gerar um id novo e guardar metadados leves (título, host, client id do
// pix.gg pra referência/suporte). O roteamento do webhook NÃO depende mais
// disso — cada leilão tem sua própria URL de webhook (/webhook/pixgg/:id),
// vinculada automaticamente na aplicação do pix.gg na hora da criação (ver
// setWebhookUrl em pixggApi.js). Sem URL compartilhada, sem precisar casar
// streamerUsername — o id na própria URL já diz de quem é a doação.
//
// A senha do apresentador NÃO fica aqui — fica com hash no state do
// próprio leilão (ver stores.js), então esse arquivo continua pequeno e
// não é onde a senha de ninguém mora. O clientSecret do pix.gg também não
// fica guardado em lugar nenhum depois de usado uma vez pra vincular o
// webhook — só o clientId, que não é segredo.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getStore, DATA_DIR } = require("./stores");
const { hashPassword } = require("./passwords");
const pixggApi = require("./pixggApi");

const REGISTRY_FILE = path.join(DATA_DIR, "_registry.json");

function emptyRegistry() {
  return { leiloes: {} };
}

function load() {
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, "utf-8");
    return { ...emptyRegistry(), ...JSON.parse(raw) };
  } catch (err) {
    return emptyRegistry();
  }
}

let registry = load();

function save() {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");
}

function generateId() {
  return crypto.randomBytes(6).toString("hex"); // 12 caracteres, só [0-9a-f]
}

const MIN_PASSWORD_LENGTH = 6;

// buildWebhookUrl(id) monta a URL completa de webhook pra esse leilão —
// quem sabe montar isso é server.js (precisa do host da requisição), por
// isso vem como função em vez de string pronta.
//
// host/hostAvatar/hostTwitchUserId/hostTwitchLogin vêm da sessão da Twitch já
// verificada no servidor (ver getTwitchSession em server.js) — nunca de
// texto digitado. hostTwitchUserId é exigido aqui, não só checado do lado de
// fora: é a mesma disciplina de "recusa barata antes de efeito colateral
// caro" que já existe pra password/clientId/clientSecret logo abaixo, e
// protege contra um futuro refactor de server.js que esqueça de checar a
// sessão antes de chamar essa função.
async function createLeilao({ title, host, hostAvatar, hostTwitchUserId, hostTwitchLogin, password, clientId, clientSecret, buildWebhookUrl }) {
  if (!hostTwitchUserId) {
    throw new Error("É necessário fazer login com a Twitch antes de criar o leilão");
  }
  if (!clientId || !clientSecret) {
    throw new Error("Informe o Client ID e o Client Secret da sua aplicação no pix.gg");
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }

  let id;
  do {
    id = generateId();
  } while (registry.leiloes[id]);

  // Vincula o webhook ANTES de salvar qualquer coisa: se o client id/secret
  // forem inválidos, o pix.gg recusa aqui e a criação falha inteira, sem
  // deixar leilão órfão no registro. É essa chamada que prova que quem tá
  // criando o leilão realmente tem acesso àquela aplicação no pix.gg.
  await pixggApi.setWebhookUrl(clientId, clientSecret, buildWebhookUrl(id));

  const meta = {
    title: title || "Leilão de Jogos",
    host: host || "",
    pixggClientId: clientId,
    // Quem é "dono" desse leilão pra fins de listagem em /meus-leiloes.
    // Separado de hostVerified (guardado no store, não aqui): posse não
    // muda mesmo que o nome exibido seja trocado depois e perca a
    // verificação (ver POST /admin/host em server.js).
    ownerTwitchUserId: hostTwitchUserId,
    createdAt: new Date().toISOString(),
  };
  registry.leiloes[id] = meta;
  save();

  const store = getStore(id);
  store.setState("adminSecretHash", hashPassword(password));
  store.setState("title", meta.title);
  store.setState("host", meta.host);
  store.setState("hostAvatar", hostAvatar || null);
  store.setState("hostTwitchUserId", hostTwitchUserId);
  store.setState("hostTwitchLogin", hostTwitchLogin || null);
  store.setState("hostVerified", "true");
  store.setState("open", "true");
  // Referência pra saber há quanto tempo esperamos o primeiro contato do
  // pix.gg (ver "webhookStale" em server.js) — se nunca chegou nenhum ping
  // desde a criação, isso também conta como sinal de webhook desvinculado.
  store.setState("createdAt", meta.createdAt);
  // Início da primeira sessão aberta — mesma referência usada por
  // isWebhookStale e pela duração do recap de encerramento (ver
  // captureAuctionDuration em server.js).
  store.setState("leilaoOpenedAt", String(Date.now()));

  return { id };
}

function leilaoExists(id) {
  return !!registry.leiloes[id];
}

function getLeilaoMeta(id) {
  return registry.leiloes[id] ? { ...registry.leiloes[id] } : null;
}

// Usado pelo timer de auto-close, que precisa passar por todos os leilões.
function listLeilaoIds() {
  return Object.keys(registry.leiloes);
}

// Pra "/meus-leiloes" — varredura em memória em vez de um índice separado
// (twitchUserId -> [ids]) de propósito: registry.leiloes inteiro já mora em
// memória (carregado uma vez em load(), acima), então isso é O(n) sem I/O de
// disco nenhum, e no tamanho desse app (um arquivo só, dezenas/centenas de
// leilões, não milhões) isso nunca vai ser o gargalo. Um índice separado
// precisaria ser mantido manualmente em TODO lugar que cria ou apaga leilão
// (inclusive deleteLeilao, que hoje não sabe nada de dono) — cada ponto novo
// é mais uma chance de esquecer e deixar o índice dessincronizado. Como
// ownerTwitchUserId mora dentro do MESMO objeto que deleteLeilao já apaga,
// essa varredura nunca pode ficar dessincronizada de um leilão apagado —
// não existe uma segunda estrutura pra esquecer de limpar.
function listLeiloesByOwner(twitchUserId) {
  if (!twitchUserId) return [];
  return Object.entries(registry.leiloes)
    .filter(([, meta]) => meta.ownerTwitchUserId === twitchUserId)
    .map(([id, meta]) => ({ id, ...meta }));
}

// Apaga um leilão do registro (some da listagem, do ranking, de qualquer
// rota — loadLeilao já 404 sozinho pra id que não existe mais aqui). Não
// apaga o arquivo de dados dele nem o cache em memória — isso é
// responsabilidade de quem chama (ver deleteStore em stores.js e a rota
// de super-admin em server.js), pra esse módulo não precisar saber de
// filesystem além do próprio _registry.json.
function deleteLeilao(id) {
  delete registry.leiloes[id];
  save();
}

module.exports = {
  createLeilao,
  leilaoExists,
  getLeilaoMeta,
  listLeilaoIds,
  listLeiloesByOwner,
  deleteLeilao,
};
