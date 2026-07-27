const VOICE_PREVIEW_SAMPLE = "Assim vai soar sua mensagem no alerta!";

function wireVoicePreview(btn) {
  let audio = null;
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "carregando…";
    try {
      if (!audio) {
        const res = await fetch(`/api/tts?text=${encodeURIComponent(VOICE_PREVIEW_SAMPLE)}`);
        if (!res.ok) throw new Error("Falha ao gerar áudio");
        const blob = await res.blob();
        audio = new Audio(URL.createObjectURL(blob));
      }
      btn.textContent = "tocando…";
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.currentTime = 0;
        audio.play().catch(resolve);
      });
    } catch (err) {
      btn.textContent = "erro, tenta de novo";
      setTimeout(() => { btn.textContent = originalText; }, 1500);
      btn.disabled = false;
      return;
    }
    btn.textContent = originalText;
    btn.disabled = false;
  });
}
