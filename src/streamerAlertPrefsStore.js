const { query } = require("./pg");

const VALID_CHIMES = new Set(["classic", "arcade", "chill", "bell", "custom"]);
const DEFAULT_CHIME = "classic";

async function getChime(streamerId) {
  const res = await query(`SELECT chime FROM streamer_alert_prefs WHERE streamer_id = $1`, [streamerId]);
  return res.rows[0] ? res.rows[0].chime : DEFAULT_CHIME;
}

async function getPrefs(streamerId) {
  const res = await query(
    `SELECT chime, custom_sound_url FROM streamer_alert_prefs WHERE streamer_id = $1`,
    [streamerId]
  );
  const row = res.rows[0];
  return {
    chime: row ? row.chime : DEFAULT_CHIME,
    customSoundUrl: row ? row.custom_sound_url : null,
  };
}

async function setChime(streamerId, chime) {
  if (!VALID_CHIMES.has(chime)) {
    throw new Error("Chime inválido");
  }
  if (chime === "custom") {
    const prefs = await getPrefs(streamerId);
    if (!prefs.customSoundUrl) {
      throw new Error("Nenhum áudio personalizado enviado ainda");
    }
  }
  await query(
    `INSERT INTO streamer_alert_prefs (streamer_id, chime)
     VALUES ($1, $2)
     ON CONFLICT (streamer_id) DO UPDATE SET chime = EXCLUDED.chime, updated_at = now()`,
    [streamerId, chime]
  );
}

async function setCustomSound(streamerId, url) {
  await query(
    `INSERT INTO streamer_alert_prefs (streamer_id, chime, custom_sound_url)
     VALUES ($1, 'custom', $2)
     ON CONFLICT (streamer_id) DO UPDATE SET chime = 'custom', custom_sound_url = EXCLUDED.custom_sound_url, updated_at = now()`,
    [streamerId, url]
  );
}

module.exports = { getChime, getPrefs, setChime, setCustomSound, VALID_CHIMES, DEFAULT_CHIME };
