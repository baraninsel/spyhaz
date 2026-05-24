// Game Screen - Main gameplay
import { getSocket, emitWithCallback } from '../socket.js';
import { getState, setState } from '../state.js';
import { renderRoleCard } from '../components/roleCard.js';
import { renderLocationGrid } from '../components/locationGrid.js';
import { renderPlayerList } from '../components/playerList.js';
import { renderChat } from '../components/chat.js';
import { renderKickChat } from '../components/kickChat.js';
import { formatTime, getTimerClass } from '../components/timer.js';
import { showToast } from '../components/toast.js';

export function renderGame(container) {
  const state = getState();

  // Auto-assign host as Kick chat viewer if not set
  if (!state.kickChatViewerId && state.isHost) {
    setState({ kickChatViewerId: state.playerId });
  }

  const isStreamer = state.playerId === state.kickChatViewerId;
  const showKickChat = isStreamer && state.kickChatVisible;

  container.innerHTML = `
    <div class="game-screen screen-wide">
      <!-- Top Bar for Timer -->
      <div class="game-topbar">
        <div class="game-topbar-left">
          <div class="lobby-section-title" style="margin-bottom: 0;">⏳ KALAN SÜRE</div>
        </div>
        <div class="game-topbar-center" style="display: flex; align-items: center; gap: var(--sp-4);">
          <div class="timer-display" id="timer-display" style="font-size: 2.5rem; line-height: 1;">${formatTime(state.timerRemaining)}</div>
          ${state.isHost ? `
            <button class="btn btn-ghost btn-sm" id="btn-timer-toggle">
              ${state.timerPaused ? '▶' : '⏸'}
            </button>
          ` : ''}
        </div>
        <div class="game-topbar-right">
          ${isStreamer ? `
            <button class="btn btn-ghost btn-sm btn-kick-toggle" id="btn-kick-toggle" title="${state.kickChatVisible ? 'Kick Chat Kapat' : 'Kick Chat Aç'}" style="${state.kickChatVisible ? 'display:none;' : ''}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;">
                <path d="M2 4.5A2.5 2.5 0 014.5 2h15A2.5 2.5 0 0122 4.5v15a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 19.5v-15z" fill="#53fc18"/>
                <path d="M8 6v12h2.5v-4.5L13 16h3l-3.5-5L16 7h-3l-2.5 3.5V6H8z" fill="#000"/>
              </svg>
              <span style="margin-left:4px; color: var(--kick-green); font-size: var(--fs-xs);">Chat</span>
            </button>
          ` : ''}
          <button class="btn btn-danger btn-sm btn-pixel" id="btn-vote-request">
            🗳️ OYLAMA BAŞLAT
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <div class="game-content ${showKickChat ? 'game-content-streamer' : ''}" id="game-content">
        <!-- Left Sidebar: Role Card + Players + Chat -->
        <div class="game-sidebar game-sidebar-left">
          <!-- Role Card -->
          <div class="role-card-container" id="role-card-area">
            ${renderRoleCard(state.isSpy, state.location, state.role)}
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

          <!-- Players -->
          <div class="card flex flex-col game-players-card">
            <div class="lobby-section-title">👥 OYUNCULAR</div>
            <div id="game-players" class="game-players-list">${renderPlayerList(state.players, {
              showStatus: true,
            })}</div>
          </div>

          <!-- Chat -->
          <div class="game-chat" id="game-chat"></div>
        </div>

        <!-- Main Area (Center) -->
        <div class="game-main">
          <!-- Question Turn -->
          <div class="card question-section" id="question-section">
            <div class="lobby-section-title">❓ SORU SIRASI (Tur ${state.questionRound})</div>
            <div id="question-content"></div>
          </div>

          <!-- Location Grid -->
          <div class="card location-grid-container">
            <div class="location-grid-title">📍 KONUMLAR</div>
            <div id="location-grid"></div>
          </div>
        </div>

        <!-- Right Sidebar: Kick Chat (Streamer Only) -->
        ${isStreamer ? `
          <div class="game-sidebar game-sidebar-right" id="kick-chat-area" style="${showKickChat ? '' : 'display:none;'}">
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Render location grid
  const gridContainer = container.querySelector('#location-grid');
  const grid = renderLocationGrid(state.locations);
  gridContainer.appendChild(grid);

  // Render in-game chat
  renderChat(container.querySelector('#game-chat'));

  // Render Kick chat (streamer only)
  if (isStreamer) {
    const kickChatArea = container.querySelector('#kick-chat-area');
    if (kickChatArea) {
      renderKickChat(kickChatArea);
    }
  }

  // Update question section
  updateQuestionSection();

  // Role hide/show toggle
  const roleToggleBtn = container.querySelector('#btn-role-toggle');
  if (roleToggleBtn) {
    roleToggleBtn.addEventListener('click', () => {
      const s = getState();
      setState({ roleHidden: !s.roleHidden });
      // Re-render role card
      const roleArea = document.getElementById('role-card-area');
      if (roleArea) {
        roleArea.innerHTML = renderRoleCard(s.isSpy, s.location, s.role);
        // Re-attach toggle listener
        const newBtn = roleArea.querySelector('#btn-role-toggle');
        if (newBtn) {
          newBtn.addEventListener('click', () => {
            const s2 = getState();
            setState({ roleHidden: !s2.roleHidden });
            const roleArea2 = document.getElementById('role-card-area');
            if (roleArea2) {
              roleArea2.innerHTML = renderRoleCard(s2.isSpy, s2.location, s2.role);
              attachRoleToggle();
            }
          });
        }
      }
    });
  }

  // KickChat topbar toggle button
  const kickToggleBtn = container.querySelector('#btn-kick-toggle');
  if (kickToggleBtn) {
    kickToggleBtn.addEventListener('click', () => {
      setState({ kickChatVisible: true });
      // Show sidebar and update grid
      const gameContent = document.getElementById('game-content');
      if (gameContent) gameContent.classList.add('game-content-streamer');
      const sidebar = document.getElementById('kick-chat-area');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.innerHTML = '';
        renderKickChat(sidebar);
      }
      kickToggleBtn.style.display = 'none';
    });
  }

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

// Recursive role toggle attachment helper
function attachRoleToggle() {
  const btn = document.querySelector('#btn-role-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const s = getState();
    setState({ roleHidden: !s.roleHidden });
    const roleArea = document.getElementById('role-card-area');
    if (roleArea) {
      roleArea.innerHTML = renderRoleCard(s.isSpy, s.location, s.role);
      attachRoleToggle();
    }
  });
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
