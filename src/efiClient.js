const https = require("https");

const BASE_URL = {
  producao: "https://pix.api.efipay.com.br",
  homologacao: "https://pix-h.api.efipay.com.br",
};

function getConfig(env) {
  if (env !== "producao" && env !== "homologacao") {
    throw new Error(`Ambiente Efí inválido: ${env}`);
  }
  const suffix = env === "producao" ? "PRODUCAO" : "HOMOLOGACAO";
  const clientId = process.env[`EFI_CLIENT_ID_${suffix}`];
  const clientSecret = process.env[`EFI_CLIENT_SECRET_${suffix}`];
  const certBase64 = process.env[`EFI_CERT_${suffix}_BASE64`];
  if (!clientId || !clientSecret || !certBase64) {
    throw new Error(
      `Credenciais da Efí (${env}) não configuradas: faltam EFI_CLIENT_ID_${suffix}/EFI_CLIENT_SECRET_${suffix}/EFI_CERT_${suffix}_BASE64`
    );
  }
  return {
    clientId,
    clientSecret,
    pfx: Buffer.from(certBase64, "base64"),
    passphrase: process.env[`EFI_CERT_${suffix}_PASSPHRASE`] || "",
    baseUrl: BASE_URL[env],
  };
}

// mTLS (certificado .p12 por chamada) não é suportado pelo fetch nativo do
// Node sem dependência extra, por isso toda chamada à API da Efí passa por
// aqui em vez de fetch direto
function request(env, { method = "GET", path, headers = {}, body } = {}) {
  const config = getConfig(env);
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const url = new URL(path, config.baseUrl);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        pfx: config.pfx,
        passphrase: config.passphrase,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            reject(new Error(`Resposta inválida da Efí em ${method} ${path} (JSON malformado). ${data}`.trim()));
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(
              `Efí recusou a chamada ${method} ${path} (status ${res.statusCode}). ${data}`.trim()
            );
            err.status = res.statusCode;
            err.body = parsed;
            reject(err);
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`Timeout ao chamar a Efí (${method} ${path})`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { request, getConfig, BASE_URL };
