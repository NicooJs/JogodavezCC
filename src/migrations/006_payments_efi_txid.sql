-- Mesma tabela "payments" serve pra Mercado Pago e Efí -- ledger_entries já
-- referencia payments(id) de forma agnóstica a processador (ver
-- 005_efi_ledger.sql). Só falta a coluna de identificador externo da Efí,
-- equivalente ao mp_payment_id, mas texto (txid) em vez de bigint.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS efi_txid TEXT UNIQUE;
