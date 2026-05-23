// Game Screen - Main gameplay
import { getSocket, emitWithCallback } from '../socket.js';
import { getState, setState } from '../state.js';
import { renderRoleCard } from '../components/roleCard.js';
import { renderLocationGrid } from '../components/locationGrid.js';
import { renderPlayerList } from '../components/playerList.js';
import { renderChat } from '../components/chat.js';
import { formatTime, getTimerClass } from '../components/timer.js';
import { showToast } from '../components/toast.js';

export function renderGame(container) {
  const state = getState();

  container.innerHTML = `
    <div class="game-screen screen-wide">
      <!-- Main Content -->
      <div class="game-content">
        <!-- Left Sidebar -->
        <div class="game-sidebar game-sidebar-left">
          <!-- Role Card -->
          <div class="role-card-container" id="role-card-area">
            ${renderRoleCard(state.isSpy, state.location, state.role)}
          </div>

          <!-- Question Turn -->
          <div class="card question-section" id="question-section">
            <div class="lobby-section-title">❓ SORU SIRASI (Tur ${state.questionRound})</div>
            <div id="question-content"></div>
          </div>

          <!-- Spy Actions -->
          ${state.isSpy ? `
            <div class="spy-actions" id="spy-actions">
              <button class="btn btn-danger btn-pixel btn-sm" id="btn-spy-guess">
                🎯 KONUMU TAHMİN ET
              </button>
              <span class="spy-guess-count">Kalan: ${state.spyGuessesLeft}</span>
            </div>
          ` : ''}
        </div>

        <!-- Main Area (Center) -->
        <div class="game-main">
          <!-- Location Grid -->
          <div class="card location-grid-container">
            <div class="location-grid-title">📍 KONUMLAR</div>
            <div id="location-grid"></div>
          </div>
          
          <!-- Timer Area -->
          <div class="card timer-container" style="margin-top: auto; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: var(--sp-6); gap: var(--sp-4);">
            <div class="lobby-section-title" style="margin-bottom: 0;">⏳ KALAN SÜRE</div>
            <div class="timer-display" id="timer-display" style="font-size: 4rem; line-height: 1;">${formatTime(state.timerRemaining)}</div>
            <div style="display: flex; gap: var(--sp-3); align-items: center;">
              ${state.isHost ? `
                <button class="btn btn-ghost btn-sm" id="btn-timer-toggle">
                  ${state.timerPaused ? '▶ Devam' : '⏸ Durdur'}
                </button>
              ` : ''}
              <button class="btn btn-danger btn-sm btn-pixel" id="btn-vote-request" style="font-size:10px; padding: 6px 12px;">
                🗳️ OYLAMA BAŞLAT
              </button>
            </div>
          </div>
        </div>

        <!-- Right Sidebar -->
        <div class="game-sidebar game-sidebar-right">
          <!-- Players -->
          <div class="card flex flex-col" style="padding: var(--sp-3); flex: 1; max-height: 50%; display: flex; flex-direction: column;">
            <div class="lobby-section-title">👥 OYUNCULAR</div>
            <div id="game-players" style="flex: 1; overflow-y: auto;">${renderPlayerList(state.players, {
              showStatus: true,
              askerId: state.currentAskerId,
              targetId: state.askedTarget,
            })}</div>
          </div>

          <!-- Chat -->
          <div class="game-chat flex-1" id="game-chat"></div>
        </div>
      </div>
    </div>
  `;

  // Render location grid
  const gridContainer = container.querySelector('#location-grid');
  const grid = renderLocationGrid(state.locations);
  gridContainer.appendChild(grid);

  // Render chat
  renderChat(container.querySelector('#game-chat'));

  // Update question section
  updateQuestionSection();

  // Timer toggle (host only)
  const timerBtn = container.querySelector('#btn-timer-toggle');
  if (timerBtn) {
    timerBtn.addEventListener('click', () => {
      const s = getState();
      getSocket().emit(s.timerPaused ? 'timer:resume' : 'timer:pause');
    });
  }

  // Vote request
  container.querySelector('#btn-vote-request').addEventListener('click', () => {
    getSocket().emit('vote:request');
  });

  // Spy guess
  const spyBtn = container.querySelector('#btn-spy-guess');
  if (spyBtn) {
    spyBtn.addEventListener('click', () => {
      showSpyGuessOverlay();
    });
  }
}

export function updateTimer() {
  const state = getState();
  const timerEl = document.getElementById('timer-display');
  if (!timerEl) return;

  timerEl.textContent = formatTime(state.timerRemaining);
  timerEl.className = `timer-display ${getTimerClass(state.timerRemaining, state.settings.duration)} ${state.timerPaused ? 'timer-paused' : ''}`;

  const toggleBtn = document.getElementById('btn-timer-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = state.timerPaused ? '▶ Devam' : '⏸ Durdur';
  }
}

export function updateQuestionSection() {
  const state = getState();
  const content = document.getElementById('question-content');
  if (!content) return;

  const isMyTurn = state.currentAskerId === state.playerId;
  const currentAsker = state.players.find(p => p.id === state.currentAskerId);
  const askerName = currentAsker?.name || '?';

  if (state.askedTarget) {
    // Question in progress
    const target = state.players.find(p => p.id === state.askedTarget);
    content.innerHTML = `
      <div class="question-arrow">
        <span class="question-player asker">${askerName}</span>
        <span style="color: var(--accent-cyan);">→</span>
        <span class="question-player target">${target?.name || '?'}</span>
      </div>
      ${isMyTurn ? `
        <button class="btn btn-primary btn-sm btn-block mt-4" id="btn-question-done">
          ✓ Soru-Cevap Tamamlandı
        </button>
      ` : `
        <div class="text-muted text-center" style="font-size: var(--fs-sm);">
          Soru-cevap devam ediyor...
        </div>
      `}
    `;

    const doneBtn = content.querySelector('#btn-question-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        getSocket().emit('question:done');
        setState({ askedTarget: null });
      });
    }
  } else if (isMyTurn) {
    // My turn to select target
    const targets = state.availableTargets || [];
    content.innerHTML = `
      <div class="question-status">Sıra sende! Kime soru sormak istiyorsun?</div>
      <div class="question-target-select">
        ${targets.map(tid => {
          const p = state.players.find(pl => pl.id === tid);
          return `<button class="question-target-btn" data-target="${tid}">${p?.name || '?'}</button>`;
        }).join('')}
      </div>
    `;

    content.querySelectorAll('.question-target-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetId = btn.dataset.target;
        const res = await emitWithCallback('question:select', { targetId });
        if (res?.error) showToast(res.error, 'error');
      });
    });
  } else {
    // Waiting for someone else
    content.innerHTML = `
      <div class="question-status">${askerName} soru soracak kişiyi seçiyor...</div>
    `;
  }
}

export function updateGamePlayers() {
  const state = getState();
  const el = document.getElementById('game-players');
  if (el) {
    el.innerHTML = renderPlayerList(state.players, {
      showStatus: true,
      askerId: state.currentAskerId,
      targetId: state.askedTarget,
    });
  }
}

export function updateSpyActions() {
  const state = getState();
  const countEl = document.querySelector('.spy-guess-count');
  if (countEl) {
    countEl.textContent = `Kalan: ${state.spyGuessesLeft}`;
  }
  const btn = document.getElementById('btn-spy-guess');
  if (btn && state.spyGuessesLeft <= 0) {
    btn.disabled = true;
  }
}

function showSpyGuessOverlay() {
  const state = getState();
  let selectedLocationId = null;

  const overlay = document.createElement('div');
  overlay.className = 'spy-guess-overlay';
  overlay.innerHTML = `
    <div class="card spy-guess-container">
      <div class="spy-guess-title">🎯 KONUMU SEÇ</div>
      <div class="spy-guess-grid" id="spy-guess-grid"></div>
      <div class="spy-guess-actions">
        <button class="btn btn-ghost" id="spy-guess-cancel">İptal</button>
        <button class="btn btn-danger btn-pixel" id="spy-guess-confirm" disabled style="font-size:9px;">
          TAHMİN ET (${state.spyGuessesLeft} hak)
        </button>
      </div>
    </div>
  `;

  const gridContainer = overlay.querySelector('#spy-guess-grid');
  const grid = renderLocationGrid(state.locations, {
    selectable: true,
    onSelect: (id) => {
      selectedLocationId = id;
      overlay.querySelector('#spy-guess-confirm').disabled = false;
    },
  });
  gridContainer.appendChild(grid);

  overlay.querySelector('#spy-guess-cancel').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('#spy-guess-confirm').addEventListener('click', async () => {
    if (!selectedLocationId) return;
    const res = await emitWithCallback('spy:guess', { locationId: selectedLocationId });
    if (res?.error) {
      showToast(res.error, 'error');
    }
    overlay.remove();
  });

  document.body.appendChild(overlay);
}
