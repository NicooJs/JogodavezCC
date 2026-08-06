-- webhook_secret é a única credencial que autentica POST /webhooks/pixgg/:secret
-- (pixgg.com não assina o payload, ver server.js) -- a entropia de
-- crypto.randomBytes(24) já torna colisão praticamente impossível, mas o
-- projeto trata "praticamente impossível" como não confiável o bastante em
-- todo outro caminho de dinheiro/crédito (ver migration 008, mesmo motivo).
-- Também acelera o SELECT * FROM streamer_pixgg_credentials WHERE
-- webhook_secret = $1 que roda em todo webhook recebido, hoje sem índice.
CREATE UNIQUE INDEX IF NOT EXISTS streamer_pixgg_credentials_webhook_secret_unique
  ON streamer_pixgg_credentials (webhook_secret);
