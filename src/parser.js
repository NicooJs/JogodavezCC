// Convenção pro chat: "+Elden Ring" apoia, "-Hollow Knight" (ou "tirar
// Hollow Knight") sabota. Sem prefixo não conta como lance.

function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const REMOVE_PATTERNS = [/^-\s*/, /^tirar\s+/i, /^remover\s+/i, /^sabotar\s+/i, /^remove\s+/i];

const ADD_PATTERNS = [/^\+\s*/, /^colocar\s+/i, /^por\s+/i, /^adicionar\s+/i, /^apostar\s+/i, /^add\s+/i, /^apoiar\s+/i, /^apoio\s+/i];

function normalizeKey(name) {
  return removeAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return null;

  let text = rawMessage.trim();
  if (!text) return null;

  let action = null;

  for (const pattern of REMOVE_PATTERNS) {
    if (pattern.test(text)) {
      action = "remove";
      text = text.replace(pattern, "");
      break;
    }
  }

  if (!action) {
    for (const pattern of ADD_PATTERNS) {
      if (pattern.test(text)) {
        action = "add";
        text = text.replace(pattern, "");
        break;
      }
    }
  }

  if (!action) return null;

  text = text.trim();
  text = text.replace(/^[\s\-–—:.,!]+/, "").replace(/[\s!.,]+$/, "").trim();

  if (!text) return null;

  const name = text.length > 60 ? text.slice(0, 60).trim() : text;
  const key = normalizeKey(name);
  if (!key) return null;

  return { action, name, key };
}

const NOISE_WORDS = new Set([
  "manda", "mandar", "vai", "ver", "vamo", "vamos", "bora", "coloca", "colocar",
  "poe", "por", "favor", "pfv", "pfvr", "porfavor", "please", "pls", "plis",
  "aew", "ae", "aqui", "logo", "isso", "essa", "esse", "jogo", "game",
  "gogogo", "go", "quero", "queria", "da", "de", "o", "a", "os", "as",
  "um", "uma", "no", "na", "pro", "pra", "com", "e",
]);

function leftoverAfterMatch(candidateKey, matchedKey) {
  const escaped = matchedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
  return candidateKey.replace(re, " ").trim();
}

function looksLikeNoise(leftover) {
  if (!leftover) return true;
  return leftover.split(/\s+/).filter(Boolean).every((w) => NOISE_WORDS.has(w));
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// pro canal do pixgg.com, onde o doador escreve livre (sem saber da
// convenção "+Jogo" pensada pro chat) -- acha um jogo JÁ existente no
// catálogo em qualquer trecho da mensagem, tolerando erro de digitação
// por palavra (não a frase inteira, senão "Valorante quero ver vc jogando"
// nunca bateria com "valorant"). Só serve pra reconhecer apoio a um jogo
// que já está em cena; nunca cria jogo novo a partir de texto sem prefixo
// (isso continua exigindo confirmação manual, ver fila de pendências).
function findExistingGameInText(rawMessage, existingGames) {
  if (!rawMessage || !Array.isArray(existingGames) || !existingGames.length) return null;
  const words = normalizeKey(rawMessage).split(" ").filter(Boolean);
  if (!words.length) return null;

  let best = null;
  let bestDist = Infinity;
  for (const game of existingGames) {
    if (!game || !game.key) continue;
    const gameWords = game.key.split(" ").filter(Boolean);
    const n = gameWords.length;
    if (!n || n > words.length) continue;
    // string curta (ex: "cs", "war") teria falso positivo fácil demais com
    // tolerância a erro -- só aceita exata pra chave com menos de 4 letras
    const threshold = game.key.length < 4 ? 0 : Math.max(1, Math.floor(game.key.length * 0.2));
    for (let i = 0; i + n <= words.length; i++) {
      const window = words.slice(i, i + n).join(" ");
      const dist = window === game.key ? 0 : levenshtein(window, game.key);
      if (dist <= threshold && dist < bestDist) {
        best = game;
        bestDist = dist;
      }
    }
  }
  return best;
}

module.exports = { parseMessage, normalizeKey, leftoverAfterMatch, looksLikeNoise, findExistingGameInText };
