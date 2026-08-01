// Script manual, de uso único: testa se um envio de Pix pra uma chave de
// titularidade DIFERENTE da conta pagadora funciona em Produção, pra
// confirmar a hipótese de que os dois NAO_REALIZADO anteriores foram por
// causa de autoenvio (mesma titularidade) sem o escopo/endpoint certo --
// ver docs/STATUS-EFI.md. Dispara uma transferência real de dinheiro.
//
// Uso: railway run node scripts/test-envio-titularidade-diferente.js
require("dotenv").config();
const efiApi = require("../src/efiApi");

const CHAVE_PAGADORA = "fd7aaa7e-c08c-4048-a9d3-30ce8c71163d"; // chave da empresa, já usada nos testes anteriores
const CHAVE_FAVORECIDO = "+5511995822094"; // chave celular precisa do +55 na frente -- chave de titularidade diferente, autorizada pelo dono do projeto
const VALOR_CENTAVOS = 100; // R$1,00

async function main() {
  console.log("Enviando Pix de teste (titularidade diferente)...");
  const idEnvio = efiApi.gerarIdEnvio();
  console.log("idEnvio:", idEnvio);

  const resultadoEnvio = await efiApi.enviarPix("producao", {
    idEnvio,
    valorCentavos: VALOR_CENTAVOS,
    chavePagadora: CHAVE_PAGADORA,
    chaveFavorecido: CHAVE_FAVORECIDO,
    infoPagador: "Teste titularidade diferente",
  });
  console.log("Resposta do envio:", JSON.stringify(resultadoEnvio, null, 2));

  console.log("\nAguardando 5s antes de consultar o status final...");
  await new Promise((r) => setTimeout(r, 5000));

  const resultadoConsulta = await efiApi.consultarEnvioPix("producao", idEnvio);
  console.log("Status final:", JSON.stringify(resultadoConsulta, null, 2));
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
