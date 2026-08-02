-- Áudio de alerta customizado é da CONTA (como o resto do Perfil) --
-- o arquivo em si fica no Volume (public/uploads, mesmo padrão da imagem
-- de fundo do board), aqui só guarda a URL. chime = 'custom' quando esse
-- áudio está ativo (validado em código, não é um CHECK aqui de propósito,
-- pra não duplicar a lista de presets em dois lugares).
ALTER TABLE streamer_alert_prefs ADD COLUMN IF NOT EXISTS custom_sound_url TEXT;
