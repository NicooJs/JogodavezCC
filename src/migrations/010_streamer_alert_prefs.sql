-- Preferência de som do alerta é da CONTA, não do leilão -- o streamer
-- escolhe uma vez no Perfil e vale pra qualquer leilão que ele tiver ou
-- vier a criar (overlay OBS de cada leilão consulta essa tabela pelo
-- dono do leilão, não guarda o chime em si mesmo).
CREATE TABLE IF NOT EXISTS streamer_alert_prefs (
  streamer_id BIGINT PRIMARY KEY REFERENCES streamers(id),
  chime       TEXT NOT NULL DEFAULT 'classic',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
