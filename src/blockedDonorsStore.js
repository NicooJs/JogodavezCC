const { query } = require("./pg");

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function rowToBlock(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    streamerId: Number(row.streamer_id),
    donorUsername: row.donor_username,
    donorUsernameDisplay: row.donor_username_display,
    donorIp: row.donor_ip,
    blockedAt: row.blocked_at,
  };
}

// nome OU ip batendo já basta -- são dois sinais fracos sozinhos (nome é
// texto livre, IP pode mudar), mas combinados dificultam bem mais que
// qualquer um isolado
async function isBlocked(streamerId, username, ip) {
  const res = await query(
    `SELECT 1 FROM streamer_blocked_donors WHERE streamer_id = $1 AND (donor_username = $2 OR donor_ip = $3) LIMIT 1`,
    [streamerId, normalizeUsername(username), ip || ""]
  );
  return res.rows.length > 0;
}

async function block(streamerId, { username, ip }) {
  const res = await query(
    `INSERT INTO streamer_blocked_donors (streamer_id, donor_username, donor_username_display, donor_ip)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (streamer_id, donor_username, donor_ip) DO NOTHING
     RETURNING *`,
    [streamerId, normalizeUsername(username), String(username || "").trim() || "Anônimo", ip]
  );
  return rowToBlock(res.rows[0]);
}

async function unblock(streamerId, blockId) {
  await query(`DELETE FROM streamer_blocked_donors WHERE id = $1 AND streamer_id = $2`, [blockId, streamerId]);
}

async function list(streamerId) {
  const res = await query(
    `SELECT * FROM streamer_blocked_donors WHERE streamer_id = $1 ORDER BY blocked_at DESC`,
    [streamerId]
  );
  return res.rows.map(rowToBlock);
}

module.exports = { isBlocked, block, unblock, list };
