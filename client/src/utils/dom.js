export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function bindAction(root, selector, handler) {
  root.querySelectorAll(selector).forEach(element => element.addEventListener('click', handler));
}
