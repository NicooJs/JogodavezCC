require("dotenv").config();
const livepix = require("../src/livepixClient");

async function main() {
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) {
    console.error("Defina PUBLIC_URL no seu .env antes de rodar isso (ex: https://seusite.com)");
    process.exit(1);
  }

  const url = `${publicUrl.replace(/\/$/, "")}/webhook/livepix`;

  console.log("Webhooks já cadastrados:");
  const existing = await livepix.listWebhooks();
  console.log(existing);

  console.log(`\nRegistrando novo webhook: ${url}`);
  const created = await livepix.registerWebhook(url);
  console.log("Criado com sucesso:", created);
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
