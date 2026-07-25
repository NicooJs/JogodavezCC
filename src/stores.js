const fs = require("fs");
const path = require("path");
const { createStore } = require("./db");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map();

function storePath(leilaoId) {
  return path.join(DATA_DIR, `${leilaoId}.json`);
}

function getStore(leilaoId) {
  if (!cache.has(leilaoId)) {
    cache.set(leilaoId, createStore(storePath(leilaoId)));
  }
  return cache.get(leilaoId);
}

// apagar o registro (registry.js) ANTES de chamar isso -- senão um
// getStore(id) no meio do caminho recria o arquivo do zero
function deleteStore(leilaoId) {
  cache.delete(leilaoId);
  try {
    fs.unlinkSync(storePath(leilaoId));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { getStore, deleteStore, storePath, DATA_DIR };
