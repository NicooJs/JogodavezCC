-- Garantia de verdade contra crédito duplicado de doação sob concorrência
-- real: antes disso, a idempotência de creditDonation() dependia só de um
-- SELECT-antes-de-INSERT dentro da transação, que tem uma janela de corrida
-- teórica (duas chamadas concorrentes com o mesmo payment_id podem passar
-- pelo SELECT antes de qualquer uma commitar). Constraint única deixa o
-- Postgres recusar a segunda tentativa de verdade, não só na prática.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_payment_kind_unique
  ON ledger_entries (payment_id, kind)
  WHERE payment_id IS NOT NULL;
