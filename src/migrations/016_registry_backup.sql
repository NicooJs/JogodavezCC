-- Cópia de segurança do registro de leilões (dono/título/criado-em), que
-- hoje mora só no JSON compartilhado do Volume persistente (ver
-- src/registry.js). NÃO é a fonte de verdade -- é uma rede de segurança
-- independente do Volume, atualizada a cada criação/exclusão/desvínculo
-- (ver src/registryBackup.js). Recuperação é manual
-- (scripts/restore-registry-from-backup.js), nunca lida no caminho normal.
CREATE TABLE IF NOT EXISTS registry_backup (
  leilao_id   TEXT PRIMARY KEY,
  meta        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
