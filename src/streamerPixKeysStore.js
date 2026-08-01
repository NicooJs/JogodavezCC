const { query } = require("./pg");

async function setPixKey(streamerId, pixKey) {
  const res = await query(
    `INSERT INTO streamer_pix_keys (streamer_id, pix_key)
     VALUES ($1, $2)
     ON CONFLICT (streamer_id) DO UPDATE SET pix_key = EXCLUDED.pix_key, updated_at = now()
     RETURNING *`,
    [streamerId, pixKey]
  );
  return res.rows[0].pix_key;
}

async function getPixKey(streamerId) {
  const res = await query(`SELECT pix_key FROM streamer_pix_keys WHERE streamer_id = $1`, [streamerId]);
  return res.rows[0] ? res.rows[0].pix_key : null;
}

module.exports = { setPixKey, getPixKey };
