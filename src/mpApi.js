// Chamada de saída pra API de Pagamentos do Mercado Pago -- cria a cobrança
// Pix em nome do STREAMER (usa o access_token dele, não o nosso), com
// application_fee retendo a parte da plataforma. É isso que faz o dinheiro
// ir direto pra conta dele: o pagamento é criado como sendo da conta do
// streamer, a plataforma só participa via application_fee.
const PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";

// application_fee é valor absoluto (não percentual) na API do MP -- por
// isso o split "97% bruto pro streamer" é calculado ANTES de chamar isso
// (ver Math.round(valorTotalCents * 0.03) em server.js), não configurado
// aqui como porcentagem.
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
    err.status = res.status; // quem chama usa isso pra distinguir 401 (token inválido/expirado, ver markDisconnected em server.js) de outras falhas
    throw err;
  }

  const txData = json.point_of_interaction && json.point_of_interaction.transaction_data;
  if (!txData || !txData.qr_code) {
    throw new Error("Mercado Pago não devolveu QR code Pix na resposta");
  }

  return {
    mpPaymentId: json.id,
    status: json.status,
    qrCode: txData.qr_code, // "copia e cola"
    qrCodeBase64: txData.qr_code_base64, // imagem PNG em base64
  };
}

// Busca o recurso completo do pagamento -- o webhook do MP só avisa "algo
// mudou", nunca confia no corpo dele pro status/valor real (ver
// src/mpWebhook.js). Usa o token do STREAMER (mesmo usado pra criar), já
// que é a conta dona do pagamento.
async function getPayment({ accessToken, paymentId }) {
  const res = await fetch(`${PAYMENTS_URL}/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Falha ao buscar pagamento ${paymentId} no Mercado Pago (status ${res.status}). ${detail}`.trim());
  }
  return res.json();
}

module.exports = { createPixPayment, getPayment };
