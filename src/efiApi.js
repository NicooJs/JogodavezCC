const crypto = require("crypto");
const { request } = require("./efiClient");
const { getAccessToken } = require("./efiAuth");

const TXID_RE = /^[a-zA-Z0-9]{26,35}$/;

function gerarIdEnvio() {
  return crypto.randomBytes(16).toString("hex"); // 32 chars, alfanumérico
}

async function criarCobranca(env, { valorCentavos, chave, solicitacaoPagador, expiracaoSegundos = 3600, devedor } = {}) {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error("valorCentavos precisa ser um inteiro maior que zero (centavos, nunca float)");
  }
  if (!chave) throw new Error("chave (Pix da conta recebedora) é obrigatória");

  const token = await getAccessToken(env);
  const body = {
    calendario: { expiracao: expiracaoSegundos },
    valor: { original: (valorCentavos / 100).toFixed(2) },
    chave,
  };
  if (solicitacaoPagador) body.solicitacaoPagador = solicitacaoPagador;
  if (devedor) body.devedor = devedor;

  return request(env, {
    method: "POST",
    path: "/v2/cob",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
}

async function consultarCobranca(env, txid) {
  if (!TXID_RE.test(txid)) throw new Error("txid inválido");
  const token = await getAccessToken(env);
  return request(env, {
    method: "GET",
    path: `/v2/cob/${txid}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

// NÃO TESTADO CONTRA A EFÍ DE VERDADE ainda: exige (1) aprovação separada
// da Efí pro escopo pix.send (aditivo, não é só marcar a caixinha) e (2) um
// webhook associado à chave pagadora, que ainda não existe (efiWebhook.js).
// idEnvio é a chave de idempotência: reenviar com o mesmo valor não duplica
// o débito, então quem chamar essa função deve guardar e reusar o idEnvio
// em caso de retry, não gerar um novo.
async function enviarPix(env, { idEnvio, valorCentavos, chavePagadora, chaveFavorecido, infoPagador } = {}) {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error("valorCentavos precisa ser um inteiro maior que zero (centavos, nunca float)");
  }
  if (!chavePagadora) throw new Error("chavePagadora (conta Master, quem envia) é obrigatória");
  if (!chaveFavorecido) throw new Error("chaveFavorecido (streamer, quem recebe) é obrigatória");

  const id = idEnvio || gerarIdEnvio();
  const token = await getAccessToken(env);
  const body = {
    valor: (valorCentavos / 100).toFixed(2),
    pagador: { chave: chavePagadora, ...(infoPagador ? { infoPagador } : {}) },
    favorecido: { chave: chaveFavorecido },
  };

  return request(env, {
    method: "PUT",
    path: `/v3/gn/pix/${id}`,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
}

async function consultarEnvioPix(env, idEnvio) {
  const token = await getAccessToken(env);
  return request(env, {
    method: "GET",
    path: `/v3/gn/pix/${idEnvio}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function registrarWebhook(env, { chave, webhookUrl } = {}) {
  if (!chave) throw new Error("chave é obrigatória");
  if (!webhookUrl) throw new Error("webhookUrl é obrigatória");

  const token = await getAccessToken(env);
  // ?ignorar= evita que a Efí acrescente "/pix" no final da URL sozinha
  return request(env, {
    method: "PUT",
    path: `/v2/webhook/${chave}?ignorar=`,
    headers: { Authorization: `Bearer ${token}` },
    body: { webhookUrl },
  });
}

async function consultarWebhook(env, chave) {
  if (!chave) throw new Error("chave é obrigatória");
  const token = await getAccessToken(env);
  return request(env, {
    method: "GET",
    path: `/v2/webhook/${chave}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

module.exports = {
  criarCobranca,
  consultarCobranca,
  enviarPix,
  consultarEnvioPix,
  gerarIdEnvio,
  registrarWebhook,
  consultarWebhook,
};
