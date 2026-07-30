-- Ledger de custódia pra migração Mercado Pago -> Efí Bank (ver
-- docs/STATUS-EFI.md). Conta Master única recebe o valor integral de cada
-- doação; essas tabelas controlam quanto cada streamer tem direito a sacar,
-- sem guardar CPF nem qualquer dado sensível além da chave Pix.

-- taxa fica numa tabela editável (1 linha só) em vez de hardcoded no código,
-- pra atualizar assim que a Efí confirmar a taxa negociada, sem precisar
-- redeploy nem migration nova
CREATE TABLE IF NOT EXISTS fee_config (
  id                              SMALLINT PRIMARY KEY DEFAULT 1,
  plataforma_percent              NUMERIC(6,5) NOT NULL DEFAULT 0.03900,
  entrada_percent                 NUMERIC(6,5) NOT NULL DEFAULT 0.01190,
  saque_percent                   NUMERIC(6,5) NOT NULL DEFAULT 0.01190,
  saque_piso_cents                INTEGER NOT NULL DEFAULT 50,
  saque_absorvido_pela_plataforma BOOLEAN NOT NULL DEFAULT true,
  saque_minimo_cents              INTEGER NOT NULL DEFAULT 3000,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
INSERT INTO fee_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- só a chave Pix -- nada de CPF/nome, ver regra em CLAUDE.md
CREATE TABLE IF NOT EXISTS streamer_pix_keys (
  streamer_id  BIGINT PRIMARY KEY REFERENCES streamers(id),
  pix_key      TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- saldo materializado por streamer -- derivável da soma de ledger_entries,
-- mas mantido à parte porque é lido toda vez que a tela de saque abre
CREATE TABLE IF NOT EXISTS streamer_balances (
  streamer_id    BIGINT PRIMARY KEY REFERENCES streamers(id),
  balance_cents  BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id              BIGSERIAL PRIMARY KEY,
  streamer_id     BIGINT NOT NULL REFERENCES streamers(id),
  requested_cents BIGINT NOT NULL CHECK (requested_cents > 0),
  fee_cents       BIGINT NOT NULL CHECK (fee_cents >= 0),
  sent_cents      BIGINT NOT NULL CHECK (sent_cents >= 0),
  efi_envio_id    TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_streamer_id ON withdrawals(streamer_id);

-- toda entrada/saída de saldo, auditável, nunca deletado ou sobrescrito
CREATE TABLE IF NOT EXISTS ledger_entries (
  id             BIGSERIAL PRIMARY KEY,
  streamer_id    BIGINT REFERENCES streamers(id),  -- NULL = fatia da própria plataforma
  kind           TEXT NOT NULL
                   CHECK (kind IN ('donation_credit', 'platform_credit', 'withdrawal_debit', 'withdrawal_reversal', 'platform_withdrawal_cost')),
  amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),  -- sempre positivo, "kind" indica o sinal
  payment_id     BIGINT REFERENCES payments(id),
  withdrawal_id  BIGINT REFERENCES withdrawals(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_streamer_id ON ledger_entries(streamer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_payment_id ON ledger_entries(payment_id);

-- reconciliação: snapshot periódico do saldo do ledger vs. extrato real da
-- Efí (job ainda não implementado, ver docs/STATUS-EFI.md)
CREATE TABLE IF NOT EXISTS reconciliation_log (
  id                  BIGSERIAL PRIMARY KEY,
  ledger_total_cents  BIGINT NOT NULL,
  efi_balance_cents   BIGINT NOT NULL,
  diff_cents          BIGINT NOT NULL,
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
