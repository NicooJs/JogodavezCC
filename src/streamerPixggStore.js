const { query } = require("./pg");
const { encryptToken, decryptToken } = require("./tokenCrypto");

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

// webhookSecret é sempre o mesmo que a rota já usou pra montar a URL
// registrada via pixggApi.setWebhookUrl -- gerar de novo aqui (como antes)
// cria um segredo diferente do que foi de fato cadastrado no pixgg.com,
// deixando o webhook deles apontado pra um segredo que não existe no nosso
// banco (bug real, causava "segredo desconhecido" em todo webhook)
async function setCredentials(streamerId, { clientId, clientSecret, pixggSlug, webhookSecret }) {
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
