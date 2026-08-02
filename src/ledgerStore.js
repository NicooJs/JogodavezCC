const { query, withTransaction } = require("./pg");

function rowToFeeConfig(row) {
  return {
    plataformaPercent: Number(row.plataforma_percent),
    entradaPercent: Number(row.entrada_percent),
    saquePercent: Number(row.saque_percent),
    saquePisoCents: row.saque_piso_cents,
    saqueAbsorvidoPelaPlataforma: row.saque_absorvido_pela_plataforma,
    saqueMinimoCents: row.saque_minimo_cents,
  };
}

async function getFeeConfig() {
  const res = await query(`SELECT * FROM fee_config WHERE id = 1`);
  return rowToFeeConfig(res.rows[0]);
}

// pura, sem I/O -- streamerShareCents nunca é afetado pelo custo de entrada,
// esse custo sempre sai da fatia da plataforma (ver docs/STATUS-EFI.md)
function computeDonationSplit(grossCents, feeConfig) {
  if (!Number.isInteger(grossCents) || grossCents <= 0) {
    throw new Error("grossCents precisa ser um inteiro positivo (centavos)");
  }
  const streamerShareCents = Math.round(grossCents * (1 - feeConfig.plataformaPercent));
  const platformShareCents = grossCents - streamerShareCents;
  const entradaCostCents = Math.max(Math.round(grossCents * feeConfig.entradaPercent), 1);
  const platformNetCents = platformShareCents - entradaCostCents;

  if (platformNetCents < 0) {
    throw new Error("fee_config inválido: plataforma_percent menor que entrada_percent deixaria a margem negativa");
  }

  return { streamerShareCents, platformNetCents, entradaCostCents };
}

// pura, sem I/O
function computeWithdrawal(balanceCents, feeConfig) {
  if (!Number.isInteger(balanceCents) || balanceCents <= 0) {
    throw new Error("balanceCents precisa ser um inteiro positivo (centavos)");
  }
  const feeCents = Math.max(Math.round(balanceCents * feeConfig.saquePercent), feeConfig.saquePisoCents);
  const sentCents = feeConfig.saqueAbsorvidoPelaPlataforma ? balanceCents : balanceCents - feeCents;

  if (sentCents < 0) {
    throw new Error("fee_config inválido: saque_minimo_cents baixo demais em relação ao piso de taxa deixaria o valor enviado negativo");
  }

  return { feeCents, sentCents };
}

function rowToWithdrawal(row) {
  if (!row) return null;
  return {
    id: Number(row.id), // withdrawals.id é BIGSERIAL -- node-pg devolve BIGINT como string, converte pra evitar "5" !== 5
    streamerId: Number(row.streamer_id), // streamers.id também é BIGSERIAL
    requestedCents: Number(row.requested_cents),
    feeCents: Number(row.fee_cents),
    sentCents: Number(row.sent_cents),
    efiEnvioId: row.efi_envio_id,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// grava o idEnvio assim que a Efí aceita a chamada -- mesmo que o processo
// caia logo em seguida, o registro de qual idEnvio foi usado sobrevive, e
// dá pra consultar o status depois em vez de perder o rastro do envio
async function attachEfiEnvioId(withdrawalId, efiEnvioId) {
  await query(`UPDATE withdrawals SET efi_envio_id = $2 WHERE id = $1`, [withdrawalId, efiEnvioId]);
}

async function findWithdrawalByEfiEnvioId(efiEnvioId) {
  const res = await query(`SELECT * FROM withdrawals WHERE efi_envio_id = $1`, [efiEnvioId]);
  return rowToWithdrawal(res.rows[0]);
}

// saques que ficaram "pending" por tempo demais -- cobre o caso do webhook
// nunca chegar (confirmado instável em homologação, ver docs/STATUS-EFI.md)
async function findStalePendingWithdrawals(olderThanMs) {
  const res = await query(
    `SELECT * FROM withdrawals WHERE status = 'pending' AND efi_envio_id IS NOT NULL AND created_at < now() - ($1 || ' milliseconds')::interval`,
    [olderThanMs]
  );
  return res.rows.map(rowToWithdrawal);
}

async function getBalance(streamerId) {
  const res = await query(`SELECT balance_cents FROM streamer_balances WHERE streamer_id = $1`, [streamerId]);
  return res.rows[0] ? Number(res.rows[0].balance_cents) : 0;
}

// quanto deveria estar de verdade na Conta Master agora: saldo de todo
// streamer (inclui saque "pending" -- o dinheiro já foi debitado do
// streamer mas ainda não saiu da conta, então continua contando aqui) +
// a fatia líquida acumulada da própria plataforma (créditos de doação
// menos custo de envio absorvido). Usado só pra reconciliação/auditoria
// (src/reconciliation.js), nunca no caminho quente de crédito/saque.
async function getLedgerTotals() {
  const res = await query(`
    SELECT
      COALESCE((SELECT SUM(balance_cents) FROM streamer_balances), 0) AS streamer_total,
      COALESCE((SELECT SUM(amount_cents) FROM ledger_entries WHERE kind = 'platform_credit'), 0)
        - COALESCE((SELECT SUM(amount_cents) FROM ledger_entries WHERE kind = 'platform_withdrawal_cost'), 0) AS platform_net,
      COALESCE((SELECT SUM(sent_cents) FROM withdrawals WHERE status = 'pending'), 0) AS pending_outbound
  `);
  const row = res.rows[0];
  const streamerTotalCents = Number(row.streamer_total);
  const platformNetCents = Number(row.platform_net);
  const pendingOutboundCents = Number(row.pending_outbound);
  return {
    streamerTotalCents,
    platformNetCents,
    pendingOutboundCents,
    totalCents: streamerTotalCents + platformNetCents + pendingOutboundCents,
  };
}

async function logReconciliation({ ledgerTotalCents, efiBalanceCents }) {
  await query(
    `INSERT INTO reconciliation_log (ledger_total_cents, efi_balance_cents, diff_cents) VALUES ($1, $2, $3)`,
    [ledgerTotalCents, efiBalanceCents, efiBalanceCents - ledgerTotalCents]
  );
}

// idempotente por payment_id -- um webhook reenviado não credita duas vezes.
// A garantia de verdade é a constraint única em (payment_id, kind)
// (migration 008): o SELECT abaixo é só um atalho pra não fazer trabalho à
// toa na maioria das vezes, quem realmente impede duplicata sob concorrência
// é o banco recusando o INSERT (capturado no catch). fee_config é lido sem
// FOR UPDATE de propósito -- travar essa linha serializaria TODA doação da
// plataforma inteira (não só do mesmo streamer) por uma tabela que quase
// nunca muda; a constraint acima já cobre a idempotência sem precisar disso.
async function creditDonation({ streamerId, paymentId, grossCents }) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM ledger_entries WHERE payment_id = $1 AND kind = 'donation_credit'`,
      [paymentId]
    );
    if (existing.rows.length > 0) return { alreadyCredited: true };

    const feeConfigRes = await client.query(`SELECT * FROM fee_config WHERE id = 1`);
    const feeConfig = rowToFeeConfig(feeConfigRes.rows[0]);
    const { streamerShareCents, platformNetCents } = computeDonationSplit(grossCents, feeConfig);

    // savepoint: se o INSERT violar a constraint, um erro dentro da transação
    // a aborta inteira até um ROLLBACK -- sem o savepoint, o COMMIT lá no
    // fim do withTransaction falharia mesmo capturando o erro aqui em JS
    await client.query(`SAVEPOINT before_credit`);
    try {
      await client.query(
        `INSERT INTO ledger_entries (streamer_id, kind, amount_cents, payment_id) VALUES ($1, 'donation_credit', $2, $3)`,
        [streamerId, streamerShareCents, paymentId]
      );
    } catch (err) {
      if (err.code === "23505") {
        await client.query(`ROLLBACK TO SAVEPOINT before_credit`);
        return { alreadyCredited: true }; // constraint pegou uma corrida de verdade
      }
      throw err;
    }
    await client.query(
      `INSERT INTO ledger_entries (streamer_id, kind, amount_cents, payment_id) VALUES (NULL, 'platform_credit', $1, $2)`,
      [platformNetCents, paymentId]
    );
    await client.query(
      `INSERT INTO streamer_balances (streamer_id, balance_cents)
       VALUES ($1, $2)
       ON CONFLICT (streamer_id) DO UPDATE SET balance_cents = streamer_balances.balance_cents + $2, updated_at = now()`,
      [streamerId, streamerShareCents]
    );

    return { alreadyCredited: false, streamerShareCents, platformNetCents };
  });
}

// só grava a intenção de saque e debita o saldo -- quem dispara o Pix Out de
// verdade é o efiApi (ainda não existe, falta conta/credencial da Efí)
async function createWithdrawal({ streamerId }) {
  return withTransaction(async (client) => {
    const feeConfigRes = await client.query(`SELECT * FROM fee_config WHERE id = 1`);
    const feeConfig = rowToFeeConfig(feeConfigRes.rows[0]);

    const balanceRes = await client.query(
      `SELECT balance_cents FROM streamer_balances WHERE streamer_id = $1 FOR UPDATE`,
      [streamerId]
    );
    const balanceCents = balanceRes.rows[0] ? Number(balanceRes.rows[0].balance_cents) : 0;
    if (balanceCents < feeConfig.saqueMinimoCents) {
      throw new Error(`Saldo de ${balanceCents} centavos abaixo do mínimo de saque (${feeConfig.saqueMinimoCents} centavos)`);
    }

    const { feeCents, sentCents } = computeWithdrawal(balanceCents, feeConfig);

    const withdrawalRes = await client.query(
      `INSERT INTO withdrawals (streamer_id, requested_cents, fee_cents, sent_cents, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [streamerId, balanceCents, feeCents, sentCents]
    );
    const withdrawalId = withdrawalRes.rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries (streamer_id, kind, amount_cents, withdrawal_id) VALUES ($1, 'withdrawal_debit', $2, $3)`,
      [streamerId, balanceCents, withdrawalId]
    );
    if (feeConfig.saqueAbsorvidoPelaPlataforma) {
      await client.query(
        `INSERT INTO ledger_entries (streamer_id, kind, amount_cents, withdrawal_id) VALUES (NULL, 'platform_withdrawal_cost', $1, $2)`,
        [feeCents, withdrawalId]
      );
    }
    await client.query(
      `UPDATE streamer_balances SET balance_cents = balance_cents - $1, updated_at = now() WHERE streamer_id = $2`,
      [balanceCents, streamerId]
    );

    return { withdrawalId, balanceCents, feeCents, sentCents };
  });
}

async function markWithdrawalSent(withdrawalId, efiEnvioId) {
  const res = await query(
    `UPDATE withdrawals SET status = 'sent', efi_envio_id = $2, completed_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
    [withdrawalId, efiEnvioId]
  );
  return res.rows[0] || null;
}

// se o Pix Out falhar depois do saldo já debitado, devolve pro streamer --
// nunca um UPDATE destrutivo no saldo, fica registrado como estorno no ledger
async function markWithdrawalFailed(withdrawalId) {
  return withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE withdrawals SET status = 'failed', completed_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
      [withdrawalId]
    );
    const withdrawal = res.rows[0];
    if (!withdrawal) return null;

    await client.query(
      `INSERT INTO ledger_entries (streamer_id, kind, amount_cents, withdrawal_id) VALUES ($1, 'withdrawal_reversal', $2, $3)`,
      [withdrawal.streamer_id, withdrawal.requested_cents, withdrawalId]
    );
    await client.query(
      `INSERT INTO streamer_balances (streamer_id, balance_cents)
       VALUES ($1, $2)
       ON CONFLICT (streamer_id) DO UPDATE SET balance_cents = streamer_balances.balance_cents + $2, updated_at = now()`,
      [withdrawal.streamer_id, withdrawal.requested_cents]
    );

    return withdrawal;
  });
}

// resolve o resultado assíncrono de um saque -- enviarPix só confirma que a
// Efí ACEITOU o pedido (EM_PROCESSAMENTO), não que o dinheiro saiu de
// verdade; o resultado real (REALIZADO/NAO_REALIZADO) chega depois. Chamado
// pelo webhook (server.js) e pela reconciliação (src/reconciliation.js) pros
// saques que passaram tempo demais sem o webhook chegar -- os dois caminhos
// convergem aqui pra não duplicar a lógica de idempotência/estorno.
async function resolveEnvioStatus(idEnvio, status, detalhe) {
  const withdrawal = await findWithdrawalByEfiEnvioId(idEnvio);
  if (!withdrawal) {
    console.warn(`[saque] nenhum saque nosso encontrado pra idEnvio="${idEnvio}".`);
    return;
  }
  if (withdrawal.status !== "pending") {
    console.log(`[saque] idEnvio="${idEnvio}" já estava "${withdrawal.status}", ignorando (idempotência).`);
    return;
  }

  if (status === "REALIZADO") {
    await markWithdrawalSent(withdrawal.id, idEnvio);
    console.log(`[saque] idEnvio="${idEnvio}" confirmado REALIZADO, withdrawalId=${withdrawal.id}.`);
  } else if (status === "NAO_REALIZADO") {
    await markWithdrawalFailed(withdrawal.id);
    console.warn(`[saque] idEnvio="${idEnvio}" veio NAO_REALIZADO, withdrawalId=${withdrawal.id} estornado. Detalhe: ${detalhe || "(sem motivo informado)"}`);
  } else {
    // status desconhecido/inesperado -- não mexe no estado, fica pending
    // pra investigação manual em vez de arriscar um estorno ou confirmação errada
    console.warn(`[saque] idEnvio="${idEnvio}" com status inesperado "${status}", withdrawalId=${withdrawal.id} deixado pending pra investigação.`);
  }
}

module.exports = {
  getFeeConfig,
  computeDonationSplit,
  computeWithdrawal,
  getBalance,
  getLedgerTotals,
  logReconciliation,
  creditDonation,
  createWithdrawal,
  attachEfiEnvioId,
  findWithdrawalByEfiEnvioId,
  findStalePendingWithdrawals,
  markWithdrawalSent,
  markWithdrawalFailed,
  resolveEnvioStatus,
};
