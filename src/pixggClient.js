// Recebe e interpreta os webhooks de doação do pixgg.com.
//
// Formato do payload (POST no /webhooks/pixgg/:secret): confirmado ao vivo
// em produção em 2026-08-06 que as chaves vinham em PascalCase (diferente
// do que a doc de exemplo antiga sugeria em camelCase). O pixgg.com avisou
// em 2026-08-21 que vai corrigir isso pra camelCase (o formato documentado
// desde sempre) -- pick() abaixo aceita as duas grafias de propósito, pra
// não depender de sincronizar nosso deploy com o dia exato da mudança
// deles nem quebrar se eles alternarem durante a transição:
// {
//   "Event"/"event": "donation.created" | "donation.paid",
//   "Timestamp"/"timestamp": "2026-08-06T12:14:11Z",
//   "Data"/"data": {
//     "TransactionPublicId"/"transactionPublicId": "trn_2ec8fcce0c224e52b919261d10933ef5",
//     "StreamerUsername"/"streamerUsername": "sabrinoca",
//     "DonatorUsername"/"donatorUsername": "nicolas",
//     "Message"/"message": "+gta 5",
//     "AudioLink"/"audioLink": null,
//     "TotalAmount"/"totalAmount": 5,
//     "Status"/"status": "created" | "paid"
//   }
// }
//
// Cada transação manda DOIS webhooks (created, depois paid) -- só contamos
// quando status === "paid". Ignorar o "created" sem marcar como processado,
// pra o "paid" que vem em seguida ainda ser aceito.
function isPaid(status) {
  return status === "paid";
}

function pick(obj, pascalKey, camelKey) {
  if (obj[pascalKey] !== undefined) return obj[pascalKey];
  return obj[camelKey];
}

function parseDonation(body = {}) {
  const data = pick(body, "Data", "data") || {};
  return {
    id: pick(data, "TransactionPublicId", "transactionPublicId") || null,
    username: pick(data, "DonatorUsername", "donatorUsername") || null,
    amountCents: toCents(pick(data, "TotalAmount", "totalAmount")),
    message: pick(data, "Message", "message") || "",
    status: pick(data, "Status", "status") || null,
    streamerUsername: pick(data, "StreamerUsername", "streamerUsername") || null,
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
