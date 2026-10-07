export function initializeDownloader() {
  const form = document.querySelector('#download-form');
  const input = document.querySelector('#video-url');
  const status = document.querySelector('#form-status');
  const button = form.querySelector('[type="submit"]');
  document.querySelector('.paste-button')?.addEventListener('click', async () => {
    try {
      input.value = await navigator.clipboard.readText();
      status.textContent = '';
    } catch {
      status.textContent =
        'Clipboard access is unavailable. Paste your link directly into the field.';
    }
    input.focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || button.disabled) return;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = '';
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input.value }),
      });
      const data = await response.json();
      status.textContent =
        data.error?.message ??
        'The server returned an unexpected response. Please try again.';
    } catch {
      status.textContent = 'Unable to reach TTSave. Please try again.';
    } finally {
      button.disabled = false;
      form.setAttribute('aria-busy', 'false');
    }
  });
}
