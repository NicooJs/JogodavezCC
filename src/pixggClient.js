// Recebe e interpreta os webhooks de doação do pixgg.com.
//
// Formato do payload (POST no /webhooks/pixgg/:secret):
// {
//   "event": "donation.created" | "donation.paid",
//   "timestamp": "2026-07-08T18:15:08Z",
//   "data": {
//     "transactionPublicId": "trn_3fca9dada3be4a5098f7a24b91c9cfe9",
//     "streamerUsername": "sabrinoca",
//     "donatorUsername": "Cristian",
//     "message": "apoiar Elden Ring",
//     "audioLink": "https://...",
//     "totalAmount": 5,
//     "status": "created" | "paid"
//   }
// }
//
// Cada transação manda DOIS webhooks (created, depois paid) -- só contamos
// quando status === "paid". Ignorar o "created" sem marcar como processado,
// pra o "paid" que vem em seguida ainda ser aceito.
function isPaid(status) {
  return status === "paid";
}

function parseDonation(body = {}) {
  const data = body.data || {};
  return {
    id: data.transactionPublicId || null,
    username: data.donatorUsername || null,
    amountCents: toCents(data.totalAmount),
    message: data.message || "",
    status: data.status || null,
    streamerUsername: data.streamerUsername || null,
  };
}

// totalAmount vem em REAIS (ex: 5 = R$5,00), não centavos.
function toCents(amount) {
  if (amount == null) return 0;
  const n = Number(amount);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

module.exports = { parseDonation, isPaid };
