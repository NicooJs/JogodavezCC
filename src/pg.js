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
  // sem isso, erro de conexão num cliente ocioso vira exceção não tratada e derruba o processo inteiro
  pool.on("error", (err) => {
    console.error("[pg] erro em cliente ocioso do pool:", err.message);
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

// pro ledger: várias queries precisam ser atômicas (ex: creditar doação +
// atualizar saldo materializado), sem isso uma falha no meio deixaria o
// saldo inconsistente com o histórico de entradas
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, getPool, withTransaction };
