// Lobby Screen
import { getSocket, emitWithCallback } from '../socket.js';
import { getState, setState } from '../state.js';
import { navigateTo } from '../router.js';
import { showToast } from '../components/toast.js';
import { renderPlayerList } from '../components/playerList.js';
import { renderChat } from '../components/chat.js';

let codeVisible = false;

export function renderLobby(container) {
  const state = getState();
  codeVisible = false;

  const maskedCode = state.roomCode.replace(/[A-Z0-9]/gi, '•');

  container.innerHTML = `
    <div class="lobby-screen">
      <div class="lobby-header">
        <h2 class="lobby-title">LOBİ</h2>
        <div class="room-code-display">
          <span class="room-code-text" id="room-code-text">${maskedCode}</span>
          <button class="room-code-toggle" id="toggle-code" title="Kodu göster/gizle">
            <svg id="eye-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
              <line id="eye-slash-line" x1="1" y1="1" x2="23" y2="23" style="display:inline;"></line>
            </svg>
          </button>
          <button class="room-code-copy-btn" id="copy-code" title="Kopyala">📋</button>
        </div>
      </div>

      <div class="lobby-content">
        <!-- Column 1: Players -->
        <div class="lobby-col">
          <div class="card lobby-players h-full">
            <div class="lobby-section-title" id="player-count-title">👥 OYUNCULAR (${state.players.length}/8)</div>
            <div class="player-list" id="player-list">
              ${renderPlayerList(state.players)}
            </div>
          </div>
        </div>

        <!-- Column 2: Settings & Actions -->
        <div class="lobby-col flex-col gap-4">
          <div class="card lobby-settings">
            <div class="lobby-section-title">⚙️ AYARLAR</div>
            ${state.isHost ? `
              <div class="settings-list">
                <div class="setting-item-lobby">
                  <div class="setting-header">
                    <span class="setting-display-label">Tur Süresi</span>
                    <span class="setting-display-value" id="lobby-duration-display">${Math.floor(state.settings.duration / 60)} dk</span>
                  </div>
                  <input type="range" class="range-slider" id="lobby-duration-slider" min="3" max="15" value="${Math.floor(state.settings.duration / 60)}" step="1" />
                </div>
                <div class="setting-item-lobby">
                  <div class="setting-header">
                    <span class="setting-display-label">Casus Tahmin Hakkı</span>
                    <span class="setting-display-value" id="lobby-guess-display">${state.settings.spyGuessCount}</span>
                  </div>
                  <input type="range" class="range-slider" id="lobby-guess-slider" min="1" max="5" value="${state.settings.spyGuessCount}" step="1" />
                </div>
              </div>
            ` : `
              <div class="settings-list">
                <div class="setting-display">
                  <span class="setting-display-label">Tur Süresi</span>
                  <span class="setting-display-value" id="lobby-duration-readonly">${Math.floor(state.settings.duration / 60)} dk</span>
                </div>
                <div class="setting-display">
                  <span class="setting-display-label">Casus Tahmin Hakkı</span>
                  <span class="setting-display-value" id="lobby-guess-readonly">${state.settings.spyGuessCount}</span>
                </div>
              </div>
            `}
          </div>

          <div class="card lobby-actions-card">
            <div class="lobby-actions">
              ${state.isHost ? `
                <button class="btn btn-primary btn-pixel btn-block" id="btn-start" ${state.players.length < 3 ? 'disabled' : ''}>
                  OYUNU BAŞLAT
                </button>
              ` : `
                <div class="text-muted text-center" style="font-size: var(--fs-sm); margin-bottom: var(--sp-3);">
                  Oda sahibinin oyunu başlatması bekleniyor...
                </div>
              `}
              <button class="btn btn-ghost btn-block mt-2" id="btn-leave">Ayrıl</button>
            </div>
          </div>
        </div>

        <!-- Column 3: Chat -->
        <div class="lobby-col">
          <div class="lobby-chat h-full" id="lobby-chat"></div>
        </div>
      </div>
    </div>
  `;

  // Toggle code visibility
  container.querySelector('#toggle-code').addEventListener('click', () => {
    codeVisible = !codeVisible;
    const codeText = container.querySelector('#room-code-text');
    const slashLine = container.querySelector('#eye-slash-line');

    if (codeVisible) {
      codeText.textContent = state.roomCode;
      slashLine.style.display = 'none';
    } else {
      codeText.textContent = maskedCode;
      slashLine.style.display = 'inline';
    }
  });

  // Copy room code
  container.querySelector('#copy-code').addEventListener('click', async () => {
    const textToCopy = state.roomCode;
    
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for non-secure contexts (HTTP)
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      showToast('Oda kodu kopyalandı!', 'success');
    } catch (err) {
      console.error('Copy failed', err);
      showToast(textToCopy, 'info');
    }
  });

  // Settings sliders (host only)
  if (state.isHost) {
    const durationSlider = container.querySelector('#lobby-duration-slider');
    const durationDisplay = container.querySelector('#lobby-duration-display');
    const guessSlider = container.querySelector('#lobby-guess-slider');
    const guessDisplay = container.querySelector('#lobby-guess-display');

    let settingsTimeout = null;

    const sendSettingsUpdate = () => {
      const newSettings = {
        duration: parseInt(durationSlider.value) * 60,
        spyGuessCount: parseInt(guessSlider.value),
      };
      setState({ settings: newSettings });
      getSocket().emit('room:updateSettings', { settings: newSettings });
    };

    durationSlider.addEventListener('input', () => {
      durationDisplay.textContent = `${durationSlider.value} dk`;
      clearTimeout(settingsTimeout);
      settingsTimeout = setTimeout(sendSettingsUpdate, 300);
    });

    guessSlider.addEventListener('input', () => {
      guessDisplay.textContent = guessSlider.value;
      clearTimeout(settingsTimeout);
      settingsTimeout = setTimeout(sendSettingsUpdate, 300);
    });
  }

  // Start game
  const startBtn = container.querySelector('#btn-start');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      startBtn.textContent = 'BAŞLIYOR...';
      const res = await emitWithCallback('game:start');
      if (res?.error) {
        showToast(res.error, 'error');
        startBtn.disabled = false;
        startBtn.textContent = 'OYUNU BAŞLAT';
      }
    });
  }

  // Leave
  container.querySelector('#btn-leave').addEventListener('click', () => {
    getSocket().emit('room:leave');
    setState({ roomCode: null, players: [], isHost: false });
    navigateTo('home');
  });

  // Render chat
  renderChat(container.querySelector('#lobby-chat'));
}

export function updatePlayerList() {
  const state = getState();
  const listEl = document.getElementById('player-list');
  if (listEl) {
    listEl.innerHTML = renderPlayerList(state.players);
  }

  // Update player count
  const countEl = document.getElementById('player-count-title');
  if (countEl) {
    countEl.innerHTML = `👥 OYUNCULAR (${state.players.length}/8)`;
  }

  // Update start button state
  const startBtn = document.getElementById('btn-start');
  if (startBtn) {
    startBtn.disabled = state.players.length < 3;
  }
}

export function updateLobbySettings() {
  const state = getState();
  // Update readonly displays for non-host
  const durationReadonly = document.getElementById('lobby-duration-readonly');
  if (durationReadonly) {
    durationReadonly.textContent = `${Math.floor(state.settings.duration / 60)} dk`;
  }
  const guessReadonly = document.getElementById('lobby-guess-readonly');
  if (guessReadonly) {
    guessReadonly.textContent = state.settings.spyGuessCount;
  }
}
