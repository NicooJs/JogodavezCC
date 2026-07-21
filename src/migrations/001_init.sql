-- Streamers conectados via OAuth do Mercado Pago e o histórico de
-- transações de doação. NÃO é onde o catálogo/eventos do leilão moram
-- (isso continua em JSON, ver src/db.js) -- esse banco só guarda credencial
-- OAuth e registro/status de pagamento, é um log de auditoria e um cofre de
-- credencial, não um saldo que a plataforma deve a alguém (ver decisão no
-- plano: modelo de "carteira virtual" foi recusado de propósito).

CREATE TABLE IF NOT EXISTS streamers (
  id                    BIGSERIAL PRIMARY KEY,
  twitch_user_id        TEXT NOT NULL UNIQUE,
  mp_user_id            BIGINT NOT NULL,
  mp_access_token       TEXT NOT NULL,   -- cifrado (iv:tag:dados hex, ver src/tokenCrypto.js)
  mp_refresh_token      TEXT NOT NULL,   -- cifrado
  mp_public_key         TEXT,            -- não é credencial, texto puro
  mp_token_expires_at   TIMESTAMPTZ,
  connected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at       TIMESTAMPTZ      -- NULL = conectado; setado quando uma chamada real falha com erro de auth
);

CREATE TABLE IF NOT EXISTS payments (
  id                      BIGSERIAL PRIMARY KEY,
  leilao_id               TEXT NOT NULL,          -- sem FK: o mundo JSON fica separado de propósito
  streamer_id             BIGINT NOT NULL REFERENCES streamers(id),
  mp_payment_id            BIGINT UNIQUE,           -- preenchido só depois que o MP confirma a criação
  external_reference       TEXT NOT NULL UNIQUE,    -- "<leilaoId>:<nonce>", nossa chave de correlação
  status                   TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING', 'PAID', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  valor_total_cents        INTEGER NOT NULL CHECK (valor_total_cents > 0),
  application_fee_cents    INTEGER NOT NULL CHECK (application_fee_cents >= 0),
  streamer_share_cents     INTEGER NOT NULL CHECK (streamer_share_cents >= 0),
  donor_username           TEXT,
  donor_message            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                  TIMESTAMPTZ,
  CHECK (streamer_share_cents + application_fee_cents = valor_total_cents)
);

CREATE INDEX IF NOT EXISTS idx_payments_leilao_id ON payments(leilao_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
