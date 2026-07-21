// Pool de conexão Postgres + helper de query -- papel equivalente ao
// stores.js pro mundo JSON, mas pro banco novo (credenciais OAuth do MP e
// histórico de transações; o catálogo do leilão continua 100% em JSON,
// esse arquivo não mexe nisso).
const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurado");
  pool = new Pool({
    connectionString,
    // Railway Postgres exige SSL na conexão pública; a interna
    // (railway.internal) não, mas aceitar SSL nos dois casos é mais simples
    // que detectar qual URL é essa -- rejectUnauthorized:false porque o
    // certificado do Railway não é validável pela cadeia padrão do Node.
    ssl: connectionString.includes("railway.internal") ? false : { rejectUnauthorized: false },
  });
  return pool;
}

// Log de query só com o texto (sem parâmetros -- é aqui que token cifrado
// ou qualquer outro dado sensível passaria se alguém esquecesse e logasse
// os params por engano) e a duração, útil pra debugar sem nunca arriscar
// vazar segredo em log.
async function query(text, params) {
  const start = Date.now();
  const res = await getPool().query(text, params);
  console.log(`[pg] ${text.split("\n")[0].trim()} -- ${Date.now() - start}ms, ${res.rowCount} linha(s)`);
  return res;
}

module.exports = { query, getPool };
