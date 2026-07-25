const PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";

// application_fee é valor absoluto em reais na API do MP, não percentual
async function createPixPayment({ accessToken, transactionAmountCents, applicationFeeCents, description, externalReference, payerEmail, idempotencyKey }) {
  const res = await fetch(PAYMENTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      payment_method_id: "pix",
      transaction_amount: transactionAmountCents / 100,
      application_fee: applicationFeeCents / 100,
      description,
      external_reference: externalReference,
      payer: { email: payerEmail },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json.message || JSON.stringify(json);
    const err = new Error(`Mercado Pago recusou a criação do Pix (status ${res.status}). ${detail}`.trim());
    err.status = res.status;
    throw err;
  }

  const txData = json.point_of_interaction && json.point_of_interaction.transaction_data;
  if (!txData || !txData.qr_code) {
    throw new Error("Mercado Pago não devolveu QR code Pix na resposta");
  }

  return {
    mpPaymentId: json.id,
    status: json.status,
    qrCode: txData.qr_code,
    qrCodeBase64: txData.qr_code_base64,
  };
}

async function getPayment({ accessToken, paymentId }) {
  const res = await fetch(`${PAYMENTS_URL}/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`Falha ao buscar pagamento ${paymentId} no Mercado Pago (status ${res.status}). ${detail}`.trim());
    err.status = res.status;
    throw err;
  }
  return res.json();
}

module.exports = { createPixPayment, getPayment };
