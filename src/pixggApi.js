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

  const data = await res.json();

  // A chamada pode responder 200 mesmo tendo salvo algo diferente do que a
  // gente mandou (ex: um proxy/cliente cortando a URL no meio, ou o pix.gg
  // normalizando de um jeito inesperado) — sem checar isso, o vínculo fica
  // silenciosamente quebrado até a primeira doação real falhar (ver
  // webhookSignatureIssue no server.js). Trata como falha de vinculação,
  // igual credencial inválida: não deixa passar sem avisar.
  if (data.webhookUrl !== webhookUrl) {
    throw new Error(
      `O pix.gg confirmou uma URL de webhook diferente da que foi enviada — ` +
      `provavelmente foi cortada ou alterada no caminho. Tente novamente.`
    );
  }
  if (data.isActive === false) {
    throw new Error("O pix.gg vinculou o webhook, mas marcou a aplicação como inativa (isActive: false). Verifique o status dela em pixgg.com.");
  }

  return data;
}

// Esconde o segredo compartilhado (?assinatura=..., o mesmo pra TODOS os
// leilões, ver PIXGG_WEBHOOK_SECRET no CLAUDE.md) antes de mostrar a URL
// confirmada pro streamer — sem isso, qualquer apresentador veria o
// segredo de todo mundo, não só do próprio leilão.
function redactWebhookUrl(url) {
  return String(url).replace(/([?&]assinatura=)[^&]*/i, "$1••••••••");
}

module.exports = { setWebhookUrl, redactWebhookUrl };
