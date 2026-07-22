// Pool de conexão Postgres + helper de query — guarda credenciais OAuth do
// MP e histórico de transações. O catálogo do leilão continua em JSON
// (src/stores.js), esse arquivo não mexe nisso.
const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurado");
  pool = new Pool({
    connectionString,
    // Railway Postgres exige SSL na conexão pública (não na interna), mas
    // detectar qual URL é qual é mais frágil que aceitar SSL nos dois casos.
    // rejectUnauthorized:false porque o certificado do Railway não valida
    // pela cadeia padrão do Node.
    ssl: connectionString.includes("railway.internal") ? false : { rejectUnauthorized: false },
  });
  return pool;
}

// Loga só o texto da query e a duração, nunca os parâmetros — é ali que
// token cifrado ou outro dado sensível passaria se alguém logasse os params.
async function query(text, params) {
  const start = Date.now();
  const res = await getPool().query(text, params);
  console.log(`[pg] ${text.split("\n")[0].trim()} -- ${Date.now() - start}ms, ${res.rowCount} linha(s)`);
  return res;
}

module.exports = { query, getPool };
