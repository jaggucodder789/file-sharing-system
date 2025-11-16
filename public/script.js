// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('uploadForm');
  const fileInput = document.getElementById('fileInput');
  const pwd = document.getElementById('password');
  const result = document.getElementById('result');
  const status = document.getElementById('status');
  const error = document.getElementById('error');
  const downloadLink = document.getElementById('downloadLink');
  const qr = document.getElementById('qr');
  const expiryText = document.getElementById('expiryText');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');

    const file = fileInput.files[0];
    if (!file) {
      error.textContent = 'Please choose a file first.';
      error.classList.remove('hidden');
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('password', pwd.value || '');

    try {
      const res = await fetch('/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Upload failed');
      }
      const data = await res.json();
      // show UI
      status.textContent = '✅ File uploaded successfully!';
      downloadLink.href = data.fileUrl;
      downloadLink.textContent = '🔗 Download Link';
      qr.src = data.qrData;
      result.classList.remove('hidden');

      // expiry countdown (simple)
      const expiresAt = data.expiresAt;
      function updateTimer(){
        const left = Math.max(0, expiresAt - Date.now());
        if (left <= 0) { expiryText.textContent = 'Expired'; clearInterval(ti); return; }
        const mins = Math.floor(left / 60000);
        const secs = Math.floor((left % 60000) / 1000);
        expiryText.textContent = `${mins}m ${secs}s`;
      }
      updateTimer();
      const ti = setInterval(updateTimer, 1000);

    } catch (err) {
      console.error(err);
      error.textContent = 'Upload failed.';
      error.classList.remove('hidden');
    }
  });
});
