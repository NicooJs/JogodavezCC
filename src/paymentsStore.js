// CRUD da tabela payments -- registro/auditoria de cada tentativa de
// doação via Mercado Pago, correlacionado por external_reference (gerado
// na criação, lido de volta no webhook).
const { query } = require("./pg");
const crypto = require("crypto");

function rowToPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    leilaoId: row.leilao_id,
    streamerId: row.streamer_id,
    mpPaymentId: row.mp_payment_id ? Number(row.mp_payment_id) : null,
    externalReference: row.external_reference,
    status: row.status,
    valorTotalCents: row.valor_total_cents,
    applicationFeeCents: row.application_fee_cents,
    streamerShareCents: row.streamer_share_cents,
    donorUsername: row.donor_username,
    donorMessage: row.donor_message,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function buildExternalReference(leilaoId) {
  return `${leilaoId}:${crypto.randomBytes(8).toString("hex")}`;
}

async function createPending({ leilaoId, streamerId, externalReference, valorTotalCents, applicationFeeCents, donorUsername, donorMessage }) {
  const streamerShareCents = valorTotalCents - applicationFeeCents;
  const res = await query(
    `INSERT INTO payments (leilao_id, streamer_id, external_reference, valor_total_cents, application_fee_cents, streamer_share_cents, donor_username, donor_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [leilaoId, streamerId, externalReference, valorTotalCents, applicationFeeCents, streamerShareCents, donorUsername || null, donorMessage || null]
  );
  return rowToPayment(res.rows[0]);
}

// Liga o id do MP ao registro já criado como PENDING em createPending, pra
// o webhook conseguir achar a linha por mp_payment_id também.
async function markCreated(externalReference, mpPaymentId) {
  const res = await query(
    `UPDATE payments SET mp_payment_id = $2, updated_at = now() WHERE external_reference = $1 RETURNING *`,
    [externalReference, mpPaymentId]
  );
  return rowToPayment(res.rows[0]);
}

async function markPaid(mpPaymentId) {
  const res = await query(
    `UPDATE payments SET status = 'PAID', paid_at = now(), updated_at = now() WHERE mp_payment_id = $1 AND status != 'PAID' RETURNING *`,
    [mpPaymentId]
  );
  return rowToPayment(res.rows[0]); // undefined se já tava PAID (idempotência) ou não achou
}

async function findByExternalReference(externalReference) {
  const res = await query(`SELECT * FROM payments WHERE external_reference = $1`, [externalReference]);
  return rowToPayment(res.rows[0]);
}

async function findByMpPaymentId(mpPaymentId) {
  const res = await query(`SELECT * FROM payments WHERE mp_payment_id = $1`, [mpPaymentId]);
  return rowToPayment(res.rows[0]);
}

module.exports = { buildExternalReference, createPending, markCreated, markPaid, findByExternalReference, findByMpPaymentId };
