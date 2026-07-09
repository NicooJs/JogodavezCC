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

module.exports = { getStore, storePath, DATA_DIR };
