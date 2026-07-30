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

async function getBalance(streamerId) {
  const res = await query(`SELECT balance_cents FROM streamer_balances WHERE streamer_id = $1`, [streamerId]);
  return res.rows[0] ? Number(res.rows[0].balance_cents) : 0;
}

// idempotente por payment_id -- um webhook reenviado não credita duas vezes
async function creditDonation({ streamerId, paymentId, grossCents }) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM ledger_entries WHERE payment_id = $1 AND kind = 'donation_credit'`,
      [paymentId]
    );
    if (existing.rows.length > 0) return { alreadyCredited: true };

    const feeConfigRes = await client.query(`SELECT * FROM fee_config WHERE id = 1 FOR UPDATE`);
    const feeConfig = rowToFeeConfig(feeConfigRes.rows[0]);
    const { streamerShareCents, platformNetCents } = computeDonationSplit(grossCents, feeConfig);

    await client.query(
      `INSERT INTO ledger_entries (streamer_id, kind, amount_cents, payment_id) VALUES ($1, 'donation_credit', $2, $3)`,
      [streamerId, streamerShareCents, paymentId]
    );
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

module.exports = {
  getFeeConfig,
  computeDonationSplit,
  computeWithdrawal,
  getBalance,
  creditDonation,
  createWithdrawal,
  markWithdrawalSent,
  markWithdrawalFailed,
};
