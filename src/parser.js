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

module.exports = { parseMessage, normalizeKey, leftoverAfterMatch, looksLikeNoise };
