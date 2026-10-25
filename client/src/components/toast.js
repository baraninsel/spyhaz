export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type; toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message; container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
