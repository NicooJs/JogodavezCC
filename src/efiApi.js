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

// POST /v2/cob não devolve a imagem do QR, só o texto copia-e-cola --
// precisa dessa segunda chamada pro loc.id que vem na resposta da cobrança.
// Escopo payloadlocation.read.
async function buscarQrCode(env, locId) {
  if (!locId) throw new Error("locId é obrigatório");
  const token = await getAccessToken(env);
  return request(env, {
    method: "GET",
    path: `/v2/loc/${locId}/qrcode`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Escopo pix.send confirmado funcionando em homologação (testado: erro
// devolvido foi de negócio "chave do favorecido não encontrada", não de
// permissão). Envio completo de ponta a ponta ainda não confirmado --
// falta uma segunda chave existente dentro do sandbox pra mandar de
// verdade (ver criarChaveAleatoria). Em Produção, pix.send pode exigir
// aditivo separado com a Efí -- ainda não confirmado.
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

// skipMtls: Railway termina o TLS na borda, então não dá pra exigir
// certificado cliente de verdade (ver src/efiWebhook.js). A própria Efí
// documenta esse header pra plataformas serverless/PaaS nessa situação --
// a Efí continua mandando o certificado dela, só que nosso servidor não
// tem como validar, por isso o segredo na URL + IP de log é quem protege.
async function registrarWebhook(env, { chave, webhookUrl, skipMtls = true } = {}) {
  if (!chave) throw new Error("chave é obrigatória");
  if (!webhookUrl) throw new Error("webhookUrl é obrigatória");

  const token = await getAccessToken(env);
  // ?ignorar= evita que a Efí acrescente "/pix" no final da URL sozinha
  return request(env, {
    method: "PUT",
    path: `/v2/webhook/${chave}?ignorar=`,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(skipMtls ? { "x-skip-mtls-checking": "true" } : {}),
    },
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

// só pra teste em homologação: cria uma 2a chave na mesma conta pra dar
// pra enviarPix ter um favorecido que existe de verdade dentro do sandbox.
// Escopo gn.pix.evp.write.
async function criarChaveAleatoria(env) {
  const token = await getAccessToken(env);
  return request(env, {
    method: "POST",
    path: "/v2/gn/evp",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function consultarSaldo(env) {
  const token = await getAccessToken(env);
  return request(env, {
    method: "GET",
    path: "/v2/gn/saldo/",
    headers: { Authorization: `Bearer ${token}` },
  });
}

module.exports = {
  criarCobranca,
  consultarCobranca,
  buscarQrCode,
  enviarPix,
  consultarEnvioPix,
  gerarIdEnvio,
  registrarWebhook,
  consultarWebhook,
  criarChaveAleatoria,
  consultarSaldo,
};
