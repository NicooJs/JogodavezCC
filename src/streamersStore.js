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

async function findByTwitchUserId(twitchUserId) {
  const res = await query(`SELECT * FROM streamers WHERE twitch_user_id = $1 AND disconnected_at IS NULL`, [twitchUserId]);
  return rowToStreamer(res.rows[0]);
}

// não filtra disconnected_at -- o webhook precisa achar o streamer mesmo
// desconectado, pra decidir se tenta renovar o token
async function findById(id) {
  const res = await query(`SELECT * FROM streamers WHERE id = $1`, [id]);
  return rowToStreamer(res.rows[0]);
}

async function markDisconnected(twitchUserId) {
  await query(`UPDATE streamers SET disconnected_at = now(), updated_at = now() WHERE twitch_user_id = $1`, [twitchUserId]);
}

module.exports = { upsertStreamer, findByTwitchUserId, findById, markDisconnected };
