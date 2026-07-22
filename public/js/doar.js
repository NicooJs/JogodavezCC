// Página standalone de doação -- mesmo fluxo do modal "Doar" do board
// (ver app.js), só que como página própria pra dar um link fixável no
// chat da live. Sem admin/apresentador nenhum aqui: é 100% público, então
// não reaproveita presenterFetch/getPassword nem nada ligado a sessão.
const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/doar/i)?.[1] || null;
if (!LEILAO_ID) {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#ccc;background:#1c1c1f;">Link inválido.</p>';
  throw new Error("LEILAO_ID ausente na URL");
}

const socket = io({ query: { leilaoId: LEILAO_ID } });

const loadingEl = document.getElementById("doar-loading");
const closedEl = document.getElementById("doar-closed");
const stepFormEl = document.getElementById("doar-step-form");
const stepPixEl = document.getElementById("doar-step-pix");
const stepSuccessEl = document.getElementById("doar-step-success");

const avatarEl = document.getElementById("doar-avatar");
const avatarFallbackEl = document.getElementById("doar-avatar-fallback");
const hostNameEl = document.getElementById("doar-host-name");
const leilaoTitleEl = document.getElementById("doar-leilao-title");
const boardLinkEl = document.getElementById("doar-board-link");
const footnoteHostEl = document.getElementById("doar-footnote-host");

const actionSeg = document.getElementById("doar-action");
const gameEl = document.getElementById("doar-game");
const amountEl = document.getElementById("doar-amount");
const quickAmountsEl = document.getElementById("doar-quick-amounts");
const nameEl = document.getElementById("doar-name");
const errorEl = document.getElementById("doar-error");
const submitBtn = document.getElementById("doar-submit");

const qrImgEl = document.getElementById("doar-qr-img");
const copyInputEl = document.getElementById("doar-copy-input");
const copyBtnEl = document.getElementById("doar-copy-btn");
const backBtn = document.getElementById("doar-back-btn");
const againBtn = document.getElementById("doar-again-btn");

let receivedFirstUpdate = false;
let currentStep = "loading"; // loading | closed | form | pix | success
let pendingPaymentId = null;

function showStep(step) {
  currentStep = step;
  loadingEl.hidden = step !== "loading";
  closedEl.hidden = step !== "closed";
  stepFormEl.hidden = step !== "form";
  stepPixEl.hidden = step !== "pix";
  stepSuccessEl.hidden = step !== "success";
}

function getAction() {
  const active = actionSeg.querySelector("button.active");
  return active ? active.dataset.action : "add";
}

function setAction(action) {
  actionSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.action === action));
}

function resetForm() {
  setAction("add");
  gameEl.value = "";
  amountEl.value = "";
  nameEl.value = "";
  errorEl.hidden = true;
  quickAmountsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  submitBtn.disabled = false;
  submitBtn.textContent = "Gerar Pix →";
}

actionSeg.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => setAction(b.dataset.action));
});

quickAmountsEl.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => {
    amountEl.value = b.dataset.amount;
    quickAmountsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
  });
});
amountEl.addEventListener("input", () => {
  quickAmountsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.amount === amountEl.value));
});

async function submitDonation(e) {
  e.preventDefault();
  const game = gameEl.value.trim();
  const amount = amountEl.value;
  errorEl.hidden = true;

  if (!game) {
    errorEl.textContent = "Informe o nome do jogo";
    errorEl.hidden = false;
    return gameEl.focus();
  }
  if (!amount || Number(amount) <= 0) {
    errorEl.textContent = "Informe um valor válido";
    errorEl.hidden = false;
    return amountEl.focus();
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Gerando…";
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/doacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: game,
        amount,
        action: getAction(),
        donorUsername: nameEl.value.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

    pendingPaymentId = String(data.paymentId);
    qrImgEl.src = `data:image/png;base64,${data.qrCodeBase64}`;
    copyInputEl.value = data.copyPaste;
    showStep("pix");
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Gerar Pix →";
  }
}

stepFormEl.addEventListener("submit", submitDonation);

backBtn.addEventListener("click", () => {
  pendingPaymentId = null;
  showStep("form");
});

againBtn.addEventListener("click", () => {
  resetForm();
  showStep("form");
});

copyBtnEl.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copyInputEl.value);
    copyBtnEl.textContent = "Copiado!";
    setTimeout(() => { copyBtnEl.textContent = "Copiar"; }, 1500);
  } catch (err) {
    copyInputEl.select();
  }
});

socket.on("update", ({ leaderboard, lastEvent }) => {
  document.documentElement.dataset.theme = leaderboard.theme || "ametista";

  if (!receivedFirstUpdate) {
    receivedFirstUpdate = true;
    hostNameEl.textContent = leaderboard.host || "Streamer";
    footnoteHostEl.textContent = leaderboard.host || "o streamer";
    if (leaderboard.title) {
      leilaoTitleEl.textContent = leaderboard.title;
      leilaoTitleEl.hidden = false;
    }
    boardLinkEl.href = `/l/${LEILAO_ID}`;
    boardLinkEl.hidden = false;

    if (leaderboard.hostAvatar) {
      avatarEl.src = leaderboard.hostAvatar;
      avatarEl.hidden = false;
      avatarFallbackEl.hidden = true;
    } else {
      avatarFallbackEl.textContent = (leaderboard.host || "?").trim().charAt(0).toUpperCase();
      avatarFallbackEl.hidden = false;
    }

    resetForm();
    showStep(leaderboard.open ? "form" : "closed");
  } else if (currentStep === "form" || currentStep === "closed") {
    // Só reage a abrir/fechar em tempo real enquanto ainda não gerou
    // nenhum Pix -- uma vez na tela de pagamento ou confirmado, não faz
    // sentido puxar o tapete de quem já está no meio do fluxo.
    showStep(leaderboard.open ? "form" : "closed");
  }

  if (lastEvent && lastEvent.paymentId != null && pendingPaymentId && String(lastEvent.paymentId) === pendingPaymentId) {
    pendingPaymentId = null;
    showStep("success");
  }
});
