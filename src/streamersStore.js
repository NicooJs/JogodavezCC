const { query } = require("./pg");

function rowToStreamer(row) {
  if (!row) return null;
  return {
    id: Number(row.id), // streamers.id é BIGSERIAL -- node-pg devolve BIGINT como string, converte pra evitar comparação estrita quebrada
    twitchUserId: row.twitch_user_id,
    connectedAt: row.connected_at,
  };
}

// streamer existe só por vínculo com o Twitch -- sem OAuth de processador
// de pagamento nenhum (custódia é da Conta Master da Efí, não por streamer)
async function ensureByTwitchUserId(twitchUserId) {
  const res = await query(
    `INSERT INTO streamers (twitch_user_id)
     VALUES ($1)
     ON CONFLICT (twitch_user_id) DO UPDATE SET twitch_user_id = EXCLUDED.twitch_user_id
     RETURNING *`,
    [twitchUserId]
  );
  return rowToStreamer(res.rows[0]);
}

async function findByTwitchUserId(twitchUserId) {
  const res = await query(`SELECT * FROM streamers WHERE twitch_user_id = $1`, [twitchUserId]);
  return rowToStreamer(res.rows[0]);
}

async function findById(id) {
  const res = await query(`SELECT * FROM streamers WHERE id = $1`, [id]);
  return rowToStreamer(res.rows[0]);
}

module.exports = { ensureByTwitchUserId, findByTwitchUserId, findById };
