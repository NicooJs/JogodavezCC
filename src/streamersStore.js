// CRUD da tabela streamers -- única camada que chama tokenCrypto, então é
// a única que já viu texto puro de access_token/refresh_token em algum
// momento. Nunca loga token bruto (só query() em pg.js loga, e só o texto
// da query + contagem de linhas, nunca os parâmetros).
const { query } = require("./pg");
const { encryptToken, decryptToken } = require("./tokenCrypto");

function rowToStreamer(row) {
  if (!row) return null;
  return {
    id: row.id,
    twitchUserId: row.twitch_user_id,
    mpUserId: Number(row.mp_user_id),
    accessToken: decryptToken(row.mp_access_token),
    refreshToken: decryptToken(row.mp_refresh_token),
    publicKey: row.mp_public_key,
    tokenExpiresAt: row.mp_token_expires_at,
    connectedAt: row.connected_at,
    disconnected: row.disconnected_at !== null,
  };
}

// Cria na primeira conexão, ou atualiza os tokens numa reconexão/renovação
// -- o refresh_token do MP roda a cada uso, então essa função é chamada de
// novo toda vez que um token é renovado, não só na conexão inicial.
// disconnected_at volta pra NULL sempre que isso roda (reconectar limpa o
// estado de "desconectado").
async function upsertStreamer({ twitchUserId, mpUserId, accessToken, refreshToken, publicKey, expiresAt }) {
  const res = await query(
    `INSERT INTO streamers (twitch_user_id, mp_user_id, mp_access_token, mp_refresh_token, mp_public_key, mp_token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (twitch_user_id) DO UPDATE SET
       mp_user_id = EXCLUDED.mp_user_id,
       mp_access_token = EXCLUDED.mp_access_token,
       mp_refresh_token = EXCLUDED.mp_refresh_token,
       mp_public_key = EXCLUDED.mp_public_key,
       mp_token_expires_at = EXCLUDED.mp_token_expires_at,
       updated_at = now(),
       disconnected_at = NULL
     RETURNING *`,
    [twitchUserId, mpUserId, encryptToken(accessToken), encryptToken(refreshToken), publicKey || null, expiresAt || null]
  );
  return rowToStreamer(res.rows[0]);
}

// null quando nunca conectou OU quando está marcado como desconectado --
// os dois casos tratam igual pra quem chama (sem MP disponível pra cobrar).
async function findByTwitchUserId(twitchUserId) {
  const res = await query(`SELECT * FROM streamers WHERE twitch_user_id = $1 AND disconnected_at IS NULL`, [twitchUserId]);
  return rowToStreamer(res.rows[0]);
}

// Pelo id numérico do Postgres (não o twitch_user_id) -- usado no webhook
// (ver server.js), que só tem o streamer_id gravado na linha de payments,
// não o twitch_user_id direto. Diferente de findByTwitchUserId, NÃO
// filtra disconnected_at: o webhook ainda precisa saber quem é o streamer
// mesmo que ele tenha sido marcado como desconectado nesse meio tempo
// (ex: pra decidir se tenta renovar o token em vez de só desistir).
async function findById(id) {
  const res = await query(`SELECT * FROM streamers WHERE id = $1`, [id]);
  return rowToStreamer(res.rows[0]);
}

async function markDisconnected(twitchUserId) {
  await query(`UPDATE streamers SET disconnected_at = now(), updated_at = now() WHERE twitch_user_id = $1`, [twitchUserId]);
}

module.exports = { upsertStreamer, findByTwitchUserId, findById, markDisconnected };
