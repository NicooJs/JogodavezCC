-- Bloqueio de doador é da CONTA (como o resto do Perfil), não do leilão --
-- vale pra qualquer leilão que o streamer tiver. Guarda nome (normalizado
-- pra comparar) E IP de quem doou, porque nome sozinho é só texto livre
-- (qualquer um digita outro nome e doa de novo); IP já é coletado pra
-- rate limit e a política de privacidade já avisa que serve pra
-- "prevenir fraude" -- não é coleta nova.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS donor_ip TEXT;

CREATE TABLE IF NOT EXISTS streamer_blocked_donors (
  id                     BIGSERIAL PRIMARY KEY,
  streamer_id            BIGINT NOT NULL REFERENCES streamers(id),
  donor_username         TEXT NOT NULL,  -- normalizado (trim + lowercase), usado pra comparar
  donor_username_display TEXT NOT NULL, -- como a pessoa digitou, só pra exibir
  donor_ip               TEXT NOT NULL,
  blocked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (streamer_id, donor_username, donor_ip)
);

CREATE INDEX IF NOT EXISTS idx_streamer_blocked_donors_streamer ON streamer_blocked_donors(streamer_id);
