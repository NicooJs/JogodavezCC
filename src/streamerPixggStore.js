const crypto = require("crypto");
const { query } = require("./pg");
const { encryptToken, decryptToken } = require("./tokenCrypto");

function generateWebhookSecret() {
  return crypto.randomBytes(24).toString("hex");
}

function rowToCredentials(row) {
  if (!row) return null;
  return {
    streamerId: Number(row.streamer_id),
    clientId: row.client_id,
    clientSecret: decryptToken(row.client_secret),
    pixggSlug: row.pixgg_slug,
    webhookSecret: row.webhook_secret,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

async function getCredentials(streamerId) {
  const res = await query(`SELECT * FROM streamer_pixgg_credentials WHERE streamer_id = $1`, [streamerId]);
  return rowToCredentials(res.rows[0]);
}

// reaproveita o webhook_secret já existente (não muda a URL cadastrada no
// pixgg.com toda vez que o streamer reconecta/atualiza clientId/secret)
async function setCredentials(streamerId, { clientId, clientSecret, pixggSlug }) {
  const existing = await getCredentials(streamerId);
  const webhookSecret = existing ? existing.webhookSecret : generateWebhookSecret();
  const res = await query(
    `INSERT INTO streamer_pixgg_credentials (streamer_id, client_id, client_secret, pixgg_slug, webhook_secret)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (streamer_id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       client_secret = EXCLUDED.client_secret,
       pixgg_slug = EXCLUDED.pixgg_slug,
       updated_at = now()
     RETURNING *`,
    [streamerId, clientId, encryptToken(clientSecret), pixggSlug, webhookSecret]
  );
  return rowToCredentials(res.rows[0]);
}

async function findByWebhookSecret(secret) {
  const res = await query(`SELECT * FROM streamer_pixgg_credentials WHERE webhook_secret = $1`, [secret]);
  return rowToCredentials(res.rows[0]);
}

async function disconnect(streamerId) {
  await query(`DELETE FROM streamer_pixgg_credentials WHERE streamer_id = $1`, [streamerId]);
}

module.exports = { getCredentials, setCredentials, findByWebhookSecret, disconnect };
