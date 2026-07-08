// Interpreta a mensagem escrita pelo doador e decide:
//  - qual jogo ela se refere
//  - se é pra ADICIONAR valor no jogo (apoiar) ou REMOVER (sabotar um jogo rival)
//
// Convenção pros espectadores (explique isso na tela do site):
//   "+Elden Ring"        -> apoia Elden Ring
//   "Elden Ring"         -> (sem prefixo) também conta como apoio, é o padrão
//   "-Hollow Knight"     -> tira valor de Hollow Knight
//   "tirar Hollow Knight" -> mesma coisa, por extenso
//   "colocar Elden Ring" / "por Elden Ring" -> mesma coisa que "+"

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

  let action = "add";

  for (const pattern of REMOVE_PATTERNS) {
    if (pattern.test(text)) {
      action = "remove";
      text = text.replace(pattern, "");
      break;
    }
  }

  if (action === "add") {
    for (const pattern of ADD_PATTERNS) {
      if (pattern.test(text)) {
        text = text.replace(pattern, "");
        break;
      }
    }
  }

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

module.exports = { parseMessage, normalizeKey };
