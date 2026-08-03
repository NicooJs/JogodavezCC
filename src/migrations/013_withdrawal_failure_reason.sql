-- Guarda o motivo real de falha de um saque (ex: "chave_favorecido_nao_encontrada"
-- vindo do gnExtras.erro da Efí, ou a mensagem de um erro síncrono de HTTP) --
-- hoje esse detalhe chegava até ledgerStore.resolveEnvioStatus e era só logado
-- no console, o streamer só via o saldo voltar sem explicação nenhuma.
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS failure_reason TEXT;
