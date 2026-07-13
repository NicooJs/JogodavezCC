// Cache de stores por leilão: cada leilão tem seu próprio arquivo JSON em
// DATA_DIR/<leilaoId>.json (ver src/db.js pro que cada store sabe fazer).
// Isolamento de propósito — um problema de escrita num leilão não pode
// afetar o arquivo de outro.

const fs = require("fs");
const path = require("path");
const { createStore } = require("./db");

// Mesma regra de DATA_DIR que o resto do projeto usa: em produção (Railway)
// aponta pro volume persistente; local, uma pasta "data/" na raiz do
// projeto (separada do antigo leilao-data.json de single-tenant).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map(); // leilaoId -> store

function storePath(leilaoId) {
  return path.join(DATA_DIR, `${leilaoId}.json`);
}

function getStore(leilaoId) {
  if (!cache.has(leilaoId)) {
    cache.set(leilaoId, createStore(storePath(leilaoId)));
  }
  return cache.get(leilaoId);
}

// Apaga o arquivo de dados de um leilão e tira do cache em memória — usado
// só pela rota de super-admin (ver server.js) pra remover leilão de teste
// de vez. Sem isso, um getStore(id) chamado logo depois recriaria o
// arquivo do zero (createStore lê um arquivo inexistente como dados
// vazios), então a ordem importa: sempre apagar o registro (registry.js)
// ANTES de chamar isso, pra nenhuma rota rode "getStore" pro id no meio
// do caminho.
function deleteStore(leilaoId) {
  cache.delete(leilaoId);
  try {
    fs.unlinkSync(storePath(leilaoId));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { getStore, deleteStore, storePath, DATA_DIR };
