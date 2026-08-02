const { query, withTransaction } = require("./pg");

// grava histórico (old -> new) antes de trocar -- item 1 da revisão de
// fluxo: sem isso não dá pra investigar quando/pra qual chave uma troca
// aconteceu, se um saque um dia for parar num lugar errado
async function setPixKey(streamerId, pixKey) {
  return withTransaction(async (client) => {
    const current = await client.query(`SELECT pix_key FROM streamer_pix_keys WHERE streamer_id = $1`, [streamerId]);
    const oldPixKey = current.rows[0] ? current.rows[0].pix_key : null;

    await client.query(`INSERT INTO pix_key_history (streamer_id, old_pix_key, new_pix_key) VALUES ($1, $2, $3)`, [
      streamerId,
      oldPixKey,
      pixKey,
    ]);

    const res = await client.query(
      `INSERT INTO streamer_pix_keys (streamer_id, pix_key)
       VALUES ($1, $2)
       ON CONFLICT (streamer_id) DO UPDATE SET pix_key = EXCLUDED.pix_key, updated_at = now()
       RETURNING *`,
      [streamerId, pixKey]
    );
    return res.rows[0].pix_key;
  });
}

async function getPixKey(streamerId) {
  const res = await query(`SELECT pix_key FROM streamer_pix_keys WHERE streamer_id = $1`, [streamerId]);
  return res.rows[0] ? res.rows[0].pix_key : null;
}

// inclui updated_at -- usado pra aplicar o cooldown entre trocar a chave e sacar
async function getPixKeyInfo(streamerId) {
  const res = await query(`SELECT pix_key, updated_at FROM streamer_pix_keys WHERE streamer_id = $1`, [streamerId]);
  if (!res.rows[0]) return null;
  return { pixKey: res.rows[0].pix_key, updatedAt: res.rows[0].updated_at };
}

module.exports = { setPixKey, getPixKey, getPixKeyInfo };
