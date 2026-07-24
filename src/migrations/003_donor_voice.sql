-- Voz de IA (Google Cloud TTS) escolhida pelo doador pra ler a mensagem em
-- voz alta no overlay de alerta. NULL = doador não escolheu voz nenhuma
-- (alerta fica só visual, como já era antes).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS donor_voice_id TEXT;
