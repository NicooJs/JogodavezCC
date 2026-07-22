// Cache de stores por leilão: cada leilão tem seu próprio arquivo JSON em
// DATA_DIR/<leilaoId>.json (ver src/db.js pro que cada store sabe fazer).
// Isolamento de propósito — um problema de escrita num leilão não pode
// afetar o arquivo de outro.

const fs = require("fs");
const path = require("path");
const { createStore } = require("./db");

// Em produção (Railway) aponta pro volume persistente; local, "data/" na
// raiz do projeto.
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

// Apaga o registro (registry.js) ANTES de chamar isso — createStore lê um
// arquivo inexistente como dados vazios, então um getStore(id) chamado no
// meio do caminho recriaria o arquivo do zero.
function deleteStore(leilaoId) {
  cache.delete(leilaoId);
  try {
    fs.unlinkSync(storePath(leilaoId));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { getStore, deleteStore, storePath, DATA_DIR };
