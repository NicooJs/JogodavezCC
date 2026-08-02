const { query } = require("./pg");

const VALID_CHIMES = new Set(["classic", "arcade", "chill", "bell"]);
const DEFAULT_CHIME = "classic";

async function getChime(streamerId) {
  const res = await query(`SELECT chime FROM streamer_alert_prefs WHERE streamer_id = $1`, [streamerId]);
  return res.rows[0] ? res.rows[0].chime : DEFAULT_CHIME;
}

async function setChime(streamerId, chime) {
  if (!VALID_CHIMES.has(chime)) {
    throw new Error("Chime inválido");
  }
  await query(
    `INSERT INTO streamer_alert_prefs (streamer_id, chime)
     VALUES ($1, $2)
     ON CONFLICT (streamer_id) DO UPDATE SET chime = EXCLUDED.chime, updated_at = now()`,
    [streamerId, chime]
  );
}

module.exports = { getChime, setChime, VALID_CHIMES, DEFAULT_CHIME };
