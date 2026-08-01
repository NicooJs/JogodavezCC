-- Migração pra Efí: streamer passa a existir só por vínculo com o Twitch,
-- sem precisar ter conectado o Mercado Pago. Colunas do MP ficam opcionais
-- (não apagadas -- histórico de doações antigas via MP continua íntegro).
ALTER TABLE streamers ALTER COLUMN mp_user_id DROP NOT NULL;
ALTER TABLE streamers ALTER COLUMN mp_access_token DROP NOT NULL;
ALTER TABLE streamers ALTER COLUMN mp_refresh_token DROP NOT NULL;
