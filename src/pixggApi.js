// Chamada de saída pra API do pixgg.com (diferente do webhook, que é
// chamada de entrada). Usada quando o streamer conecta a conta no Perfil,
// pra vincular automaticamente a URL de webhook (por conta, não mais por
// leilão -- ver src/streamerPixggStore.js) em vez de pedir pra ele colar a
// URL manualmente no painel deles.
//
// Autenticação por header (não é OAuth de verdade, é client_id+secret fixos
// da aplicação que o streamer criou em pixgg.com > Aplicações):
//   X-Client-Id: <clientId>
//   X-Client-Secret: <clientSecret>

const BASE_URL = "https://app.pixgg.com";

// Vincula a URL de webhook na aplicação do pixgg.com identificada por
// clientId/clientSecret. Se as credenciais forem inválidas, o pixgg.com
// responde com erro e essa função lança -- isso É a prova de posse: só quem
// tem o clientSecret de verdade consegue vincular o webhook.
async function setWebhookUrl(clientId, clientSecret, webhookUrl) {
  const res = await fetch(`${BASE_URL}/Applications/api/set-webhook-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
      "X-Client-Secret": clientSecret,
    },
    body: JSON.stringify({ webhookUrl }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`pixgg.com recusou o client ID/secret (status ${res.status}). ${detail}`.trim());
  }

  const data = await res.json();

  // a chamada pode responder 200 mesmo tendo salvo algo diferente do que a
  // gente mandou -- sem checar isso, o vínculo fica silenciosamente quebrado
  // até a primeira doação real falhar
  if (data.webhookUrl !== webhookUrl) {
    throw new Error(
      "O pixgg.com confirmou uma URL de webhook diferente da que foi enviada -- " +
      "provavelmente foi cortada ou alterada no caminho. Tente novamente."
    );
  }
  if (data.isActive === false) {
    throw new Error("O pixgg.com vinculou o webhook, mas marcou a aplicação como inativa (isActive: false). Verifique o status dela em pixgg.com.");
  }

  return data;
}

module.exports = { setWebhookUrl };
