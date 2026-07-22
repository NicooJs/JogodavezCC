// Interpreta a mensagem escrita pelo doador e decide:
//  - qual jogo ela se refere
//  - se é pra ADICIONAR valor no jogo (apoiar) ou REMOVER (sabotar um jogo rival)
//
// Convenção pros espectadores (explique isso na tela do site):
//   "+Elden Ring"        -> apoia Elden Ring
//   "-Hollow Knight"     -> tira valor de Hollow Knight
//   "tirar Hollow Knight" -> mesma coisa, por extenso
//   "colocar Elden Ring" / "por Elden Ring" -> mesma coisa que "+"
//
// Mensagem sem nenhum desses prefixos não conta como lance — fica só
// registrada no histórico. Prefixo é obrigatório de propósito: sem ele,
// qualquer mensagem de chat sem intenção de dar lance viraria um lote sozinha.

function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const REMOVE_PATTERNS = [/^-\s*/, /^tirar\s+/i, /^remover\s+/i, /^sabotar\s+/i, /^remove\s+/i];

const ADD_PATTERNS = [/^\+\s*/, /^colocar\s+/i, /^por\s+/i, /^adicionar\s+/i, /^apostar\s+/i, /^add\s+/i];

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

  // Sem "+"/"-" (ou palavra equivalente) no começo, não é lance nenhum —
  // só bate-papo normal que veio junto da doação. Ignora.
  if (!action) return null;

  text = text.trim();
  // tira pontuação solta nas pontas, tipo "Elden Ring!!" ou "-- Elden Ring"
  text = text.replace(/^[\s\-–—:.,!]+/, "").replace(/[\s!.,]+$/, "").trim();

  if (!text) return null;

  // limita tamanho pra evitar mensagens gigantes/spam virando "nome de jogo"
  const name = text.length > 60 ? text.slice(0, 60).trim() : text;
  const key = normalizeKey(name);
  if (!key) return null;

  return { action, name, key };
}

// Palavras comuns que aparecem junto do nome do jogo numa doação ("minecraft
// manda ver!!") sem fazer parte do título — usado pra decidir se o texto que
// sobra depois de bater com um jogo catalogado é ruído (mesmo jogo) ou pode
// ser um título diferente com nome parecido (spin-off, DLC), que merece
// conferência na RAWG antes de fundir num lote existente (ver
// resolveParsedGame em server.js).
const NOISE_WORDS = new Set([
  "manda", "mandar", "vai", "ver", "vamo", "vamos", "bora", "coloca", "colocar",
  "poe", "por", "favor", "pfv", "pfvr", "porfavor", "please", "pls", "plis",
  "aew", "ae", "aqui", "logo", "isso", "essa", "esse", "jogo", "game",
  "gogogo", "go", "quero", "queria", "da", "de", "o", "a", "os", "as",
  "um", "uma", "no", "na", "pro", "pra", "com", "e",
]);

// Tira a primeira ocorrência de matchedKey (como frase inteira) de dentro de
// candidateKey e devolve o que sobrou, já sem espaços nas pontas.
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
