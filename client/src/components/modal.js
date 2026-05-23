// Modal Component
export function showModal(title, contentHTML, options = {}) {
  closeModal(); // Close any existing modal

  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'active-modal';

  const showClose = options.closable !== false;

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        ${showClose ? '<button class="modal-close" id="modal-close-btn">✕</button>' : ''}
      </div>
      <div class="modal-body">${contentHTML}</div>
      ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
    </div>
  `;

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && showClose) closeModal();
  });

  root.appendChild(overlay);

  // Close button
  const closeBtn = overlay.querySelector('#modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  // Run onMount callback
  if (options.onMount) {
    requestAnimationFrame(() => options.onMount(overlay));
  }

  return overlay;
}

export function closeModal() {
  const modal = document.getElementById('active-modal');
  if (modal) modal.remove();
}
