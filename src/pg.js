const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurado");
  pool = new Pool({
    connectionString,
    // certificado do Railway não valida pela cadeia padrão do Node
    ssl: connectionString.includes("railway.internal") ? false : { rejectUnauthorized: false },
  });
  return pool;
}

// nunca loga os params -- é ali que token cifrado passaria
async function query(text, params) {
  const start = Date.now();
  const res = await getPool().query(text, params);
  console.log(`[pg] ${text.split("\n")[0].trim()} -- ${Date.now() - start}ms, ${res.rowCount} linha(s)`);
  return res;
}

module.exports = { query, getPool };
