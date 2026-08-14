// integra com a YouTube Data API v3 só pra pegar duração/título/capa de um
// link do YouTube quando alguém sugere um vídeo pro modo reacts -- exige uma
// YOUTUBE_API_KEY (Google Cloud Console, gratuita, mesmo padrão de credencial
// que IGDB_CLIENT_ID/TMDB_API_KEY já usam). Sem a chave, ou pra link de
// qualquer outra plataforma (X/Twitter etc.), cai pro cadastro manual no
// board -- a feature nunca trava por falta de credencial.

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"]);
const TWITTER_HOSTS = new Set(["twitter.com", "x.com"]);

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (YOUTUBE_HOSTS.has(host)) return "youtube";
    if (TWITTER_HOSTS.has(host)) return "twitter";
    return "other";
  } catch {
    return "other";
  }
}

function extractYoutubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (YOUTUBE_HOSTS.has(host)) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/live/")) return u.pathname.split("/")[2] || null;
    }
    return null;
  } catch {
    return null;
  }
}

// "PT1H2M10S" -> segundos
function parseIso8601Duration(iso) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!match) return null;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

// devolve o que der pra descobrir sozinho -- duração só vem se for YouTube E
// tiver a chave configurada; o resto fica null quando não dá, a UI pede pro
// apresentador completar na hora de aprovar.
async function fetchVideoMetadata(url) {
  const platform = detectPlatform(url);
  const result = { platform, title: null, thumbnail: null, durationSeconds: null };

  if (platform !== "youtube") return result;

  const videoId = extractYoutubeId(url);
  if (!videoId) return result;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return result;

  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=snippet,contentDetails&key=${apiKey}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error("YouTube Data API respondeu", res.status, "ao buscar vídeo", videoId);
      return result;
    }
    const json = await res.json();
    const item = json.items && json.items[0];
    if (!item) return result;
    result.title = (item.snippet && item.snippet.title) || null;
    result.thumbnail = (item.snippet && item.snippet.thumbnails && (item.snippet.thumbnails.high || item.snippet.thumbnails.default) || {}).url || null;
    result.durationSeconds = parseIso8601Duration(item.contentDetails && item.contentDetails.duration);
    return result;
  } catch (err) {
    console.error("Erro ao buscar metadata do YouTube:", err.message);
    return result;
  }
}

module.exports = { fetchVideoMetadata, detectPlatform, extractYoutubeId, parseIso8601Duration };
