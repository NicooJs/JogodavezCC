// Resolve saques que ficaram "pending" sem o webhook de confirmação chegar
// -- confirmado nesta mesma investigação que a entrega do webhook de envio
// da Efí é inconsistente em homologação (só 1 de 3 entregas chegou num
// teste), então não dá pra confiar só nele. Rede de segurança, não o
// caminho principal (isso continua sendo o webhook, que resolve na hora).
//
// Também audita periodicamente se o saldo total do nosso ledger bate com o
// saldo real na Conta Master da Efí -- item 3 da revisão de fluxo, pra
// pegar qualquer drift silencioso (bug futuro, evento perdido) antes que
// vire um problema descoberto só quando um streamer reclamar.
const efiApi = require("./efiApi");
const ledgerStore = require("./ledgerStore");

const CHECK_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 2 * 60_000; // dá 2min de folga pro webhook chegar primeiro
const BALANCE_CHECK_INTERVAL_MS = 15 * 60_000;
const BALANCE_DIFF_TOLERANCE_CENTS = 5; // arredondamento, não é alarme

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

// só compara e loga -- nunca corrige nada sozinho, drift automático em
// dinheiro é exatamente o tipo de coisa que precisa de olho humano
async function checkTotalBalance() {
  if (!process.env.DATABASE_URL) return;

  let ledgerTotalCents, efiBalanceCents;
  try {
    const totals = await ledgerStore.getLedgerTotals();
    ledgerTotalCents = totals.totalCents;
    const saldo = await efiApi.consultarSaldo(efiEnv());
    efiBalanceCents = Math.round(Number(saldo.saldo) * 100);
  } catch (err) {
    console.error("[reconciliacao] falha ao comparar saldo total:", err.message);
    return;
  }

  const diffCents = efiBalanceCents - ledgerTotalCents;
  await ledgerStore.logReconciliation({ ledgerTotalCents, efiBalanceCents });

  if (Math.abs(diffCents) > BALANCE_DIFF_TOLERANCE_CENTS) {
    console.error(
      `[reconciliacao] DIVERGÊNCIA de saldo: ledger=${ledgerTotalCents}c efi=${efiBalanceCents}c diff=${diffCents}c -- investigar.`
    );
  }
}

function start() {
  setInterval(() => {
    checkPendingWithdrawals().catch((err) => console.error("[reconciliacao] erro inesperado no tick:", err.message));
  }, CHECK_INTERVAL_MS);

  setInterval(() => {
    checkTotalBalance().catch((err) => console.error("[reconciliacao] erro inesperado no tick de saldo:", err.message));
  }, BALANCE_CHECK_INTERVAL_MS);
}

module.exports = { start, checkPendingWithdrawals, checkTotalBalance };
