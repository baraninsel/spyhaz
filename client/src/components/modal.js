let dispose = null;
export function closeModal() { dispose?.(); dispose = null; document.getElementById('active-modal')?.remove(); }
export function showModal(title, contentHTML, options = {}) {
  closeModal();
  const root = document.getElementById('modal-root'), previous = document.activeElement;
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'active-modal';
  overlay.innerHTML = `<section class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title" class="modal-title"></h2>${options.closable === false ? '' : '<button class="modal-close" aria-label="Pencereyi kapat" id="modal-close-btn">✕</button>'}</div><div class="modal-body">${contentHTML}</div>${options.footer ? '<div class="modal-footer">' + options.footer + '</div>' : ''}</section>`;
  overlay.querySelector('#modal-title').textContent = title;
  root.appendChild(overlay);
  const controller = new AbortController();
  dispose = () => { controller.abort(); options.onClose?.(); if (previous?.isConnected) previous.focus?.(); };
  overlay.querySelector('#modal-close-btn')?.addEventListener('click', closeModal);
  overlay.addEventListener('click', event => { if (event.target === overlay && options.closable !== false) closeModal(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && options.closable !== false) { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,select,a[href]')].filter(el => !el.hidden);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, { signal: controller.signal });
  requestAnimationFrame(() => { if (!overlay.isConnected) return; options.onMount?.(overlay); overlay.querySelector('input,button,textarea')?.focus(); });
  return overlay;
}
