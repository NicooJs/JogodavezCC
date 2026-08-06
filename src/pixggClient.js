// Recebe e interpreta os webhooks de doação do pixgg.com.
//
// Formato real do payload (POST no /webhooks/pixgg/:secret), confirmado ao
// vivo em produção em 2026-08-06 -- as chaves vêm em PascalCase (diferente
// do que a doc de exemplo antiga sugeria em camelCase, nunca confirmado
// contra um evento real até então):
// {
//   "Event": "donation.created" | "donation.paid",
//   "Timestamp": "2026-08-06T12:14:11Z",
//   "Data": {
//     "TransactionPublicId": "trn_2ec8fcce0c224e52b919261d10933ef5",
//     "StreamerUsername": "sabrinoca",
//     "DonatorUsername": "nicolas",
//     "Message": "+gta 5",
//     "AudioLink": null,
//     "TotalAmount": 5,
//     "Status": "created" | "paid"
//   }
// }
//
// Cada transação manda DOIS webhooks (created, depois paid) -- só contamos
// quando Status === "paid". Ignorar o "created" sem marcar como processado,
// pra o "paid" que vem em seguida ainda ser aceito.
function isPaid(status) {
  return status === "paid";
}

function parseDonation(body = {}) {
  const data = body.Data || {};
  return {
    id: data.TransactionPublicId || null,
    username: data.DonatorUsername || null,
    amountCents: toCents(data.TotalAmount),
    message: data.Message || "",
    status: data.Status || null,
    streamerUsername: data.StreamerUsername || null,
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
