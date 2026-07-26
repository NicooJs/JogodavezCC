function wireCopyButton(btn, inputEl) {
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    try {
      await navigator.clipboard.writeText(inputEl.value);
      btn.classList.add("is-copied");
      btn.disabled = true;
      setTimeout(() => {
        btn.classList.remove("is-copied");
        btn.disabled = false;
      }, 1500);
    } catch (err) {
      inputEl.select();
    }
  });
}
