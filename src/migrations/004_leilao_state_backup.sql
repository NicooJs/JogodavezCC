-- Cópia de segurança periódica do estado dos leilões (catálogo/eventos), que
-- hoje mora em JSON no Volume persistente (ver src/db.js). NÃO é a fonte de
-- verdade -- é uma rede de segurança independente do Volume, atualizada a
-- cada snapshot (ver src/stateBackup.js). Recuperação é manual
-- (scripts/restore-leilao-from-backup.js), nunca lida no caminho normal.
CREATE TABLE IF NOT EXISTS leilao_state_backup (
  leilao_id   TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
