const MAX_CHARS = 200;
const MAX_CACHE_ENTRIES = 300;

const cache = new Map();

function cacheSet(key, value) {
  cache.set(key, value);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

async function synthesize(text) {
  const clean = String(text || "").trim().slice(0, MAX_CHARS);
  if (!clean) return null;

  const cached = cache.get(clean);
  if (cached) return cached;

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&q=${encodeURIComponent(clean)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://translate.google.com/",
    },
  });
  if (!res.ok) throw new Error(`Google TTS respondeu ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const entry = { buffer, contentType: "audio/mpeg" };
  cacheSet(clean, entry);
  return entry;
}

module.exports = { synthesize };
