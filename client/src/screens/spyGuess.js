// Spy Guess Screen (standalone module for when spy guesses from game)
// This is handled inline in game.js via showSpyGuessOverlay
// This file exists for potential future standalone use

export function showSpyGuessResult(data) {
  // Create a brief overlay showing the result
  const overlay = document.createElement('div');
  overlay.className = 'vote-overlay';
  overlay.style.zIndex = '250';

  if (data.correct) {
    overlay.innerHTML = `
      <div class="card vote-container" style="text-align: center; padding: var(--sp-8);">
        <div style="font-size: 4rem; margin-bottom: var(--sp-4);">🎯</div>
        <div class="pixel-title" style="font-size: var(--fs-sm); color: var(--danger); margin-bottom: var(--sp-3);">
          DOĞRU TAHMİN!
        </div>
        <div style="color: var(--text-secondary);">
          ${data.spyName} konumu doğru bildi: <strong>${data.guessedLocationName}</strong>
        </div>
      </div>
    `;
  } else {
    overlay.innerHTML = `
      <div class="card vote-container" style="text-align: center; padding: var(--sp-8);">
        <div style="font-size: 4rem; margin-bottom: var(--sp-4);">❌</div>
        <div class="pixel-title" style="font-size: var(--fs-sm); color: var(--accent-cyan); margin-bottom: var(--sp-3);">
          YANLIŞ TAHMİN!
        </div>
        <div style="color: var(--text-secondary);">
          ${data.spyName} yanlış tahmin etti: <strong>${data.guessedLocationName}</strong>
        </div>
        ${data.guessesLeft > 0
          ? `<div class="badge badge-danger mt-4">Kalan hak: ${data.guessesLeft}</div>`
          : `<div class="badge badge-success mt-4">Tahmin hakkı bitti!</div>`
        }
      </div>
    `;
  }

  document.body.appendChild(overlay);
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 3000);
}
