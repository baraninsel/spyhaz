// Lobby Screen
import { getSocket, emitWithCallback } from '../socket.js';
import { getState, setState, clearSession } from '../state.js';
import { navigateTo } from '../router.js';
import { showToast } from '../components/toast.js';
import { renderPlayerList } from '../components/playerList.js';
import { renderChat } from '../components/chat.js';
import { openLocationManager } from '../components/locationManager.js';
import { getPresets, savePreset, deletePreset, loadPreset, isRecommended, exportPresetText, importPresetFromText } from '../utils/presetManager.js';
import { showModal, closeModal } from '../components/modal.js';

let codeVisible = false;

export function renderLobby(container) {
  const state = getState();
  codeVisible = false;

  const maskedCode = state.roomCode.replace(/[A-Z0-9]/gi, '•');
  const enabledCount = state.settings.enabledLocationIds?.length || 30;

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
            ${state.roundNumber > 0 ? `
              <div class="divider" style="margin: var(--sp-3) 0;"></div>
              <div class="lobby-section-title" style="font-size: 9px;">🏆 SKOR (${state.roundNumber} tur)</div>
              <div class="lobby-scoreboard">
                ${[...state.players]
                  .sort((a, b) => ((state.scores || {})[b.id] || 0) - ((state.scores || {})[a.id] || 0))
                  .map((p, i) => {
                    const pts = (state.scores || {})[p.id] || 0;
                    const medal = i === 0 && pts > 0 ? '🥇' : i === 1 && pts > 0 ? '🥈' : '';
                    return `<div class="lobby-score-row"><span>${medal} ${p.name}</span><span class="score-pts">${pts} puan</span></div>`;
                  }).join('')}
              </div>
            ` : ''}
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

                <!-- Location Manager Button -->
                <button class="setting-item-lobby setting-item-clickable" id="btn-manage-locations">
                  <div class="setting-header">
                    <span class="setting-display-label">📍 Konumlar</span>
                    <span class="setting-display-value">
                      <span class="loc-badge" id="loc-count-badge">${enabledCount}/30</span>
                    </span>
                  </div>
                  <div class="setting-subtitle">Konumları ekle veya çıkar</div>
                </button>

                <!-- Preset Section -->
                <div class="setting-item-lobby preset-section">
                  <div class="setting-header">
                    <span class="setting-display-label">💾 Presetler</span>
                  </div>
                  <div class="preset-actions" id="preset-actions">
                    <button class="btn btn-sm btn-ghost preset-btn" id="btn-load-preset">Yükle</button>
                    <button class="btn btn-sm btn-ghost preset-btn" id="btn-save-preset">Kaydet</button>
                  </div>
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
                <div class="setting-display">
                  <span class="setting-display-label">📍 Konumlar</span>
                  <span class="setting-display-value" id="loc-count-readonly">${enabledCount}/30</span>
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
        enabledLocationIds: getState().settings.enabledLocationIds,
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

    // Location Manager button
    container.querySelector('#btn-manage-locations').addEventListener('click', () => {
      const currentIds = getState().settings.enabledLocationIds || Array.from({ length: 30 }, (_, i) => i + 1);
      openLocationManager(currentIds, (newIds) => {
        const currentSettings = getState().settings;
        const newSettings = { ...currentSettings, enabledLocationIds: newIds };
        setState({ settings: newSettings });
        getSocket().emit('room:updateSettings', { settings: newSettings });
        // Update the badge
        const badge = document.getElementById('loc-count-badge');
        if (badge) badge.textContent = `${newIds.length}/30`;
      });
    });

    // Preset: Load
    container.querySelector('#btn-load-preset').addEventListener('click', () => {
      showPresetLoadModal();
    });

    // Preset: Save
    container.querySelector('#btn-save-preset').addEventListener('click', () => {
      showPresetSaveModal();
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
    clearSession();
    setState({ roomCode: null, players: [], isHost: false });
    navigateTo('home');
  });

  // Render chat
  renderChat(container.querySelector('#lobby-chat'));
}

// ── Preset Modals ──────────────────────────────────────────────

function showPresetLoadModal() {
  const presets = getPresets();
  const playerCount = getState().players.length;

  // Sort: recommended first
  const sorted = [...presets].sort((a, b) => {
    const aRec = isRecommended(a, playerCount) ? 0 : 1;
    const bRec = isRecommended(b, playerCount) ? 0 : 1;
    return aRec - bRec;
  });

  const presetsHTML = sorted.map(p => {
    const rec = isRecommended(p, playerCount);
    return `
    <div class="preset-item ${rec ? 'preset-recommended' : ''}" data-preset-id="${p.id}">
      <div class="preset-item-info">
        <span class="preset-item-icon">${p.icon}</span>
        <div class="preset-item-details">
          <div class="preset-item-name-row">
            <span class="preset-item-name">${p.name}</span>
            ${rec ? '<span class="preset-rec-badge">⭐ Önerilen</span>' : ''}
          </div>
          <span class="preset-item-meta">
            ${Math.floor(p.duration / 60)} dk · Tahmin: ${p.spyGuessCount} · ${p.enabledLocationIds.length} konum
            ${p.minPlayers ? ` · ${p.minPlayers}-${p.maxPlayers} kişi` : ''}
          </span>
          ${p.description ? `<span class="preset-item-desc">${p.description}</span>` : ''}
        </div>
      </div>
      <div class="preset-item-actions">
        <button class="btn btn-sm ${rec ? 'btn-primary' : 'btn-ghost'} preset-load-btn" data-preset-id="${p.id}">Yükle</button>
        ${!p.isDefault ? `<button class="btn btn-sm btn-ghost preset-delete-btn" data-preset-id="${p.id}" title="Sil">🗑️</button>` : ''}
      </div>
    </div>
  `;
  }).join('');

  showModal('💾 PRESET YÜKLE', `
    <div class="preset-tabs">
      <button class="preset-tab active" data-tab="list">📋 Presetler</button>
      <button class="preset-tab" data-tab="import">📥 İçe Aktar</button>
    </div>
    <div class="preset-tab-content" id="preset-tab-list">
      <div class="preset-player-hint">
        👥 Lobide <strong>${playerCount}</strong> oyuncu var — önerilen presetler üstte
      </div>
      <div class="preset-list">
        ${presetsHTML}
      </div>
    </div>
    <div class="preset-tab-content hidden" id="preset-tab-import">
      <p class="preset-save-desc">Paylaşılan preset metnini yapıştırın:</p>
      <textarea class="input preset-import-textarea" id="preset-import-text" rows="6" placeholder='{"name":"...","duration":480,"spyGuessCount":2,"enabledLocationIds":[1,2,3,...]}'></textarea>
      <button class="btn btn-primary btn-block mt-4" id="btn-import-preset">İçe Aktar</button>
    </div>
  `, {
    onMount: (overlay) => {
      // Tab switching
      overlay.querySelectorAll('.preset-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          overlay.querySelectorAll('.preset-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const target = tab.dataset.tab;
          overlay.querySelector('#preset-tab-list').classList.toggle('hidden', target !== 'list');
          overlay.querySelector('#preset-tab-import').classList.toggle('hidden', target !== 'import');
        });
      });

      // Load preset
      overlay.querySelectorAll('.preset-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const settings = loadPreset(btn.dataset.presetId);
          if (!settings) { showToast('Preset bulunamadı!', 'error'); return; }
          setState({ settings });
          getSocket().emit('room:updateSettings', { settings });
          closeModal();
          showToast('Preset yüklendi!', 'success');
          renderLobby(document.getElementById('app'));
        });
      });

      // Delete preset
      overlay.querySelectorAll('.preset-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          deletePreset(btn.dataset.presetId);
          closeModal();
          showToast('Preset silindi.', 'info');
          setTimeout(() => showPresetLoadModal(), 200);
        });
      });

      // Import preset from text
      overlay.querySelector('#btn-import-preset').addEventListener('click', () => {
        const text = overlay.querySelector('#preset-import-text').value;
        if (!text.trim()) { showToast('Metin alanı boş.', 'warning'); return; }

        const result = importPresetFromText(text);
        if (result.error) { showToast(result.error, 'error'); return; }

        // Save as user preset and apply
        savePreset(result.name, result);
        setState({ settings: { duration: result.duration, spyGuessCount: result.spyGuessCount, enabledLocationIds: result.enabledLocationIds } });
        getSocket().emit('room:updateSettings', { settings: getState().settings });
        closeModal();
        showToast(`"${result.name}" içe aktarıldı ve uygulandı!`, 'success');
        renderLobby(document.getElementById('app'));
      });
    }
  });
}

function showPresetSaveModal() {
  const s = getState().settings;
  const exportText = exportPresetText(s);

  showModal('💾 PRESET KAYDET', `
    <div class="preset-save-form">
      <p class="preset-save-desc">Mevcut ayarları preset olarak kaydet</p>
      <div class="preset-save-preview">
        <div class="preset-preview-item">
          <span class="setting-display-label">Süre</span>
          <span class="setting-display-value">${Math.floor(s.duration / 60)} dk</span>
        </div>
        <div class="preset-preview-item">
          <span class="setting-display-label">Tahmin Hakkı</span>
          <span class="setting-display-value">${s.spyGuessCount}</span>
        </div>
        <div class="preset-preview-item">
          <span class="setting-display-label">Konumlar</span>
          <span class="setting-display-value">${s.enabledLocationIds?.length || 30}/30</span>
        </div>
      </div>
      <div class="input-group mt-4">
        <label class="input-label">Preset Adı</label>
        <input type="text" class="input" id="preset-name-input" placeholder="Ör: Akşam Oyunu" maxlength="20" autocomplete="off" />
      </div>
      <div class="divider"></div>
      <div class="preset-export-section">
        <label class="input-label">📤 Paylaşım Metni</label>
        <p class="preset-save-desc">Bu metni kopyalayıp başkalarına gönderin:</p>
        <textarea class="input preset-export-textarea" id="preset-export-text" rows="3" readonly>${exportText}</textarea>
        <button class="btn btn-sm btn-ghost mt-2" id="btn-copy-export">📋 Kopyala</button>
      </div>
    </div>
  `, {
    footer: `
      <button class="btn btn-ghost" onclick="document.getElementById('active-modal')?.remove()">İptal</button>
      <button class="btn btn-primary" id="confirm-save-preset">Kaydet</button>
    `,
    onMount: (overlay) => {
      const nameInput = overlay.querySelector('#preset-name-input');
      nameInput.focus();

      overlay.querySelector('#confirm-save-preset').addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) { showToast('Lütfen bir preset adı girin.', 'warning'); return; }
        if (name.length < 2) { showToast('Preset adı en az 2 karakter olmalı.', 'warning'); return; }
        savePreset(name, getState().settings);
        closeModal();
        showToast(`"${name}" preseti kaydedildi!`, 'success');
      });

      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#confirm-save-preset').click();
      });

      // Copy export text
      overlay.querySelector('#btn-copy-export').addEventListener('click', async () => {
        const text = overlay.querySelector('#preset-export-text').value;
        try {
          await navigator.clipboard.writeText(text);
          showToast('Preset metni kopyalandı!', 'success');
        } catch {
          overlay.querySelector('#preset-export-text').select();
          document.execCommand('copy');
          showToast('Preset metni kopyalandı!', 'success');
        }
      });
    }
  });
}

// ── Update Functions ───────────────────────────────────────────

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
  const locReadonly = document.getElementById('loc-count-readonly');
  if (locReadonly) {
    locReadonly.textContent = `${state.settings.enabledLocationIds?.length || 30}/30`;
  }
  // Update host badge too
  const locBadge = document.getElementById('loc-count-badge');
  if (locBadge) {
    locBadge.textContent = `${state.settings.enabledLocationIds?.length || 30}/30`;
  }
}
