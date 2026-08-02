-- Auditoria de troca de chave Pix -- item 1 da revisão de fluxo: sem isso,
-- não tem como investigar "quando/pra qual chave isso mudou" se um saque
-- for parar num lugar errado. Cooldown em si é aplicado em código
-- (server.js), usando streamer_pix_keys.updated_at que já existia.
CREATE TABLE IF NOT EXISTS pix_key_history (
  id BIGSERIAL PRIMARY KEY,
  streamer_id BIGINT NOT NULL REFERENCES streamers(id),
  old_pix_key TEXT,
  new_pix_key TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pix_key_history_streamer_id ON pix_key_history(streamer_id);
