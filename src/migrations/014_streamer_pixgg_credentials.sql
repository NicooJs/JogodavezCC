-- Ponte temporária pra sexta-feira: doação via pixgg.com (o dinheiro vai
-- direto pro streamer, JogodaVez não custodia) enquanto o KYC de
-- intermediador da Efí não é aprovado (ver docs/STATUS-EFI.md). Credencial
-- é por CONTA, igual streamer_alert_prefs -- o streamer conecta uma vez no
-- Perfil, vale pra qualquer leilão que ele tiver.
CREATE TABLE IF NOT EXISTS streamer_pixgg_credentials (
  streamer_id     BIGINT PRIMARY KEY REFERENCES streamers(id),
  client_id       TEXT NOT NULL,
  client_secret   TEXT NOT NULL, -- cifrado (iv:tag:dados hex, ver src/tokenCrypto.js)
  pixgg_slug      TEXT NOT NULL, -- parte pública da URL, ex: "sabrinoca" em pixgg.com/sabrinoca
  webhook_secret  TEXT NOT NULL, -- segredo nosso, na URL do webhook que registramos no pixgg.com
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
