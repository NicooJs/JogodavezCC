const STORAGE_KEY = "meus-leiloes";

const form = document.getElementById("create-form");
const errorEl = document.getElementById("create-error");
const submitBtn = document.getElementById("create-submit");
const resultEl = document.getElementById("create-result");
const resultUrlEl = document.getElementById("create-result-url");
const resultOpenEl = document.getElementById("create-result-open");
const resultCopyBtn = document.getElementById("create-result-copy");
const existingEl = document.getElementById("create-existing");
const existingListEl = document.getElementById("create-existing-list");
const existingNewBtn = document.getElementById("create-existing-new");

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function getSavedLeiloes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveLeilao(entry) {
  const list = getSavedLeiloes();
  list.push(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // localStorage indisponível (modo privado, etc) — sem problema, só não
    // lembra da próxima vez.
  }
}

// /l/<id> -> <id>, ou null se a url guardada não bater nesse formato.
function extractLeilaoId(url) {
  const match = String(url || "").match(/\/l\/([a-z0-9_-]+)/i);
  return match ? match[1] : null;
}

// Confere se o leilão ainda existe de verdade no servidor — sem isso, um
// leilão apagado (ex: limpeza de teste pelo super-admin) continuava
// aparecendo pra sempre nesse navegador como "já criado", com um link morto.
// Em caso de erro de rede (offline, etc) assume que existe: melhor mostrar
// um link que pode estar velho do que apagar a referência por causa de uma
// falha passageira de conexão.
async function leilaoStillExists(id) {
  if (!id) return false;
  try {
    const res = await fetch(`/api/l/${id}/leaderboard`);
    if (res.status === 404) return false;
    return true;
  } catch (err) {
    return true;
  }
}

// Lembrete de leilão já criado nesse navegador — pra evitar que a pessoa
// preencha o formulário de novo sem querer. Recriar não é só redundante:
// como o vínculo do webhook é um-por-aplicação no pix.gg, criar de novo com
// o mesmo Client ID desliga o webhook do leilão antigo sem avisar.
async function renderExisting() {
  const saved = getSavedLeiloes();
  if (saved.length === 0) return;

  const checks = await Promise.all(saved.map((item) => leilaoStillExists(extractLeilaoId(item.url))));
  const stillValid = saved.filter((_, index) => checks[index]);

  if (stillValid.length !== saved.length) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stillValid));
    } catch (err) {
      // localStorage indisponível — sem problema, só não persiste a limpeza.
    }
  }

  if (stillValid.length === 0) return;

  existingListEl.innerHTML = stillValid.map((item) => `
    <div class="create-existing-item">
      <span>${escapeHtml(item.title || "Leilão de Jogos")}</span>
      <a href="${escapeHtml(item.url)}" target="_blank">Abrir →</a>
    </div>
  `).join("");
  existingEl.hidden = false;
  form.hidden = true;
}

existingNewBtn.addEventListener("click", () => {
  existingEl.hidden = true;
  form.hidden = false;
});

renderExisting();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const title = document.getElementById("f-title").value.trim();
  const host = document.getElementById("f-host").value.trim();
  const clientId = document.getElementById("f-client-id").value.trim();
  const clientSecret = document.getElementById("f-client-secret").value.trim();
  const password = document.getElementById("f-password").value;

  if (!host || !clientId || !clientSecret || !password) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Vinculando webhook…";

  try {
    const res = await fetch("/api/leiloes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, host, clientId, clientSecret, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

    const url = `${location.origin}${data.url}`;
    saveLeilao({ title: title || "Leilão de Jogos", url: data.url });
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

