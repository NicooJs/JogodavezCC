// Chamada de saída pra API do pix.gg (diferente do webhook, que é chamada de
// entrada). Usada só na criação do leilão, pra vincular automaticamente a
// URL de webhook daquele leilão na aplicação do streamer — em vez de pedir
// pra ele colar a URL manualmente no painel deles.
//
// Autenticação por header (não é OAuth de verdade, é client_id+secret fixos
// da aplicação que o streamer criou em pixgg.com > Aplicações):
//   X-Client-Id: <clientId>
//   X-Client-Secret: <clientSecret>

const BASE_URL = "https://app.pixgg.com";

// Vincula a URL de webhook na aplicação do pix.gg identificada por
// clientId/clientSecret. Se as credenciais forem inválidas, o pix.gg
// responde com erro e essa função lança — isso É a prova de posse: só quem
// tem o clientSecret de verdade consegue vincular o webhook.
//
// Cuidado: a documentação do pix.gg tem o texto e o exemplo de curl
// divergindo nesse caminho (o texto fala em /Applications/api/... , o
// exemplo de curl mostra /Applications/... sem "/api/"). Testado na prática
// em 2026-07-10: só a versão COM "/api/" funciona — sem, a resposta é
// 405 Método Não Permitido.
async function setWebhookUrl(clientId, clientSecret, webhookUrl) {
  const res = await fetch(`${BASE_URL}/Applications/api/set-webhook-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
      "X-Client-Secret": clientSecret,
    },
    body: JSON.stringify({ webhookUrl }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`pix.gg recusou o client ID/secret (status ${res.status}). ${detail}`.trim());
  }

  return res.json();
}

module.exports = { setWebhookUrl };
