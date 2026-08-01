// Resolve saques que ficaram "pending" sem o webhook de confirmação chegar
// -- confirmado nesta mesma investigação que a entrega do webhook de envio
// da Efí é inconsistente em homologação (só 1 de 3 entregas chegou num
// teste), então não dá pra confiar só nele. Rede de segurança, não o
// caminho principal (isso continua sendo o webhook, que resolve na hora).
const efiApi = require("./efiApi");
const ledgerStore = require("./ledgerStore");

const CHECK_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 2 * 60_000; // dá 2min de folga pro webhook chegar primeiro

function efiEnv() {
  return process.env.EFI_ENV === "producao" ? "producao" : "homologacao";
}

async function checkPendingWithdrawals() {
  if (!process.env.DATABASE_URL) return;

  const stale = await ledgerStore.findStalePendingWithdrawals(STALE_AFTER_MS);
  for (const withdrawal of stale) {
    try {
      const consulta = await efiApi.consultarEnvioPix(efiEnv(), withdrawal.efiEnvioId);
      const erro = consulta.gnExtras && consulta.gnExtras.erro;
      const detalhe = erro ? `${erro.codigo || ""} ${erro.motivo || ""}`.trim() : null;
      await ledgerStore.resolveEnvioStatus(withdrawal.efiEnvioId, consulta.status, detalhe);
    } catch (err) {
      console.error(`[reconciliacao] falha ao consultar idEnvio="${withdrawal.efiEnvioId}":`, err.message);
    }
  }
}

function start() {
  setInterval(() => {
    checkPendingWithdrawals().catch((err) => console.error("[reconciliacao] erro inesperado no tick:", err.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { start, checkPendingWithdrawals };
