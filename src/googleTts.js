// Sintetiza a mensagem do doador em áudio via Google Cloud Text-to-Speech,
// pra ler em voz alta no overlay de alerta (OBS). Chave simples de API
// (GOOGLE_TTS_API_KEY) -- sem OAuth de service account, o endpoint REST de
// synthesize aceita a chave direto na query string.
const SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

// Lista curada (não é o catálogo inteiro do Google) -- só vozes Neural2 em
// pt-BR, as mais naturais disponíveis. O rótulo é o que o doador vê.
const VOICES = [
  { id: "pt-BR-Neural2-A", label: "Voz 1" },
  { id: "pt-BR-Neural2-B", label: "Voz 2" },
  { id: "pt-BR-Neural2-C", label: "Voz 3" },
];
const VOICE_IDS = new Set(VOICES.map((v) => v.id));

// null quando não há nada a sintetizar (sem chave configurada, voz
// inválida ou texto vazio) -- quem chama trata como "sem áudio, segue o
// alerta só visual", nunca como erro.
async function synthesize(text, voiceId) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey || !VOICE_IDS.has(voiceId)) return null;

  const clean = String(text || "").trim().slice(0, 140);
  if (!clean) return null;

  const res = await fetch(`${SYNTHESIZE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: clean },
      voice: { languageCode: "pt-BR", name: voiceId },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google TTS respondeu ${res.status}: ${detail.slice(0, 200)}`.trim());
  }

  const json = await res.json();
  if (!json.audioContent) throw new Error("Google TTS não devolveu áudio na resposta");
  return Buffer.from(json.audioContent, "base64");
}

module.exports = { synthesize, VOICES, VOICE_IDS };
