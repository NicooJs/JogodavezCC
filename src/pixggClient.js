// Recebe e interpreta os webhooks de doação do pix.gg (pixgg.com).
// Spec confirmada com o Cris, do pix.gg, em 2026-07-08.
//
// Formato do payload (POST no /webhook/pixgg):
// {
//   "event": "donation.created" | "donation.paid",
//   "timestamp": "2026-07-08T18:15:08Z",
//   "data": {
//     "transactionPublicId": "trn_3fca9dada3be4a5098f7a24b91c9cfe9",
//     "streamerUsername": "comportado",
//     "donatorUsername": "Cristian",
//     "message": "Doação de testes",
//     "audioLink": "https://...",  // instável — o Cris pediu pra não usar ainda
//     "totalAmount": 1,
//     "status": "created" | "paid"
//   }
// }
//
// Cada transação manda DOIS webhooks (created, depois paid) — só contamos
// quando status === "paid". O pix.gg manda o mesmo evento "created" antes,
// sem valor confirmado; ignorar sem marcar como processado, pra o "paid"
// que vem em seguida ainda ser aceito.
//
// Sem assinatura em header. Combinado com o Cris: a proteção é um segredo na
// própria URL do webhook (?assinatura=xxxx), que o pix.gg reenvia igual em
// toda chamada — o FORMATO do segredo é string simples (não HMAC), mas a
// COMPARAÇÃO do nosso lado usa timingSafeEqualString (ver src/passwords.js)
// pra não vazar o segredo por tempo de resposta — isso é só uma escolha
// nossa de implementação, não muda nada do combinado com o pix.gg.
const { timingSafeEqualString } = require("./passwords");

function verifySignature(providedSecret, expectedSecret) {
  if (!expectedSecret) return true; // sem segredo configurado, não valida (dev local)
  return timingSafeEqualString(providedSecret, expectedSecret);
}

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

// [AJUSTAR SE PRECISO] o exemplo do Cris veio com totalAmount:1 numa
// "Doação de testes" — assumindo que é em REAIS (R$1,00), não centavos, já
// que o campo não tem sufixo "Cents" como o resto da API costuma usar. Se na
// prática os valores baterem errado (ex: doação de R$5 virando R$0,05),
// trocar essa conta pra `Math.round(n)` (valor já em centavos).
function toCents(amount) {
  if (amount == null) return 0;
  const n = Number(amount);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

// PONTO MULTI-STREAMER. O pix.gg já manda quem recebeu a doação
// (data.streamerUsername) — não precisa de OAuth nem de URL por streamer.
// HOJE: só existe o leilão da Sabrinoca, então o valor retornado ainda não é
// usado pra rotear nada (server.js ignora e usa o leilão único).
// FUTURO: usar esse username pra resolver qual leilão/streamer é.
function identifyStreamer(body = {}) {
  return (body.data && body.data.streamerUsername) || null;
}

module.exports = { verifySignature, parseDonation, isPaid, identifyStreamer };
