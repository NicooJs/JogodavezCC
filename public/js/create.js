const form = document.getElementById("create-form");
const errorEl = document.getElementById("create-error");
const submitBtn = document.getElementById("create-submit");
const resultEl = document.getElementById("create-result");
const resultUrlEl = document.getElementById("create-result-url");
const resultOpenEl = document.getElementById("create-result-open");
const resultCopyBtn = document.getElementById("create-result-copy");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const title = document.getElementById("f-title").value.trim();
  const host = document.getElementById("f-host").value.trim();
  const pixggUsername = document.getElementById("f-pixgg").value.trim();
  const password = document.getElementById("f-password").value;

  if (!host || !pixggUsername || !password) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Criando…";

  try {
    const res = await fetch("/api/leiloes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, host, pixggUsername, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

    const url = `${location.origin}${data.url}`;
    resultUrlEl.value = url;
    resultOpenEl.href = data.url;
    form.hidden = true;
    resultEl.hidden = false;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Criar leilão";
  }
});

resultCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultUrlEl.value);
    resultCopyBtn.textContent = "Copiado!";
    setTimeout(() => { resultCopyBtn.textContent = "Copiar"; }, 1500);
  } catch (err) {
    resultUrlEl.select();
  }
});
