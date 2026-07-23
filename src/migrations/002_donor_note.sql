-- Mensagem livre e opcional que o doador escreve pra aparecer no alerta da
-- live -- separado de donor_message (que é só o "+NomeDoJogo" interno usado
-- pra identificar o lote, ver processDonationMessage em server.js).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS donor_note TEXT;
