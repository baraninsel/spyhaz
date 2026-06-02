// ══════════════════════════════════════════════════════════════
// Detective Notebook (Dedektif Not Defteri) Component
// Client-side only — localStorage persistence, no server comm
// ══════════════════════════════════════════════════════════════

import { getState } from '../state.js';
import { getInitials } from './playerList.js';

// Rating level definitions
const RATING_LEVELS = [
  { level: 1, icon: '‼️', label: 'ÇOK ŞÜPHELİ', tooltip: 'Çok Şüpheli' },
  { level: 2, icon: '❓', label: 'ŞÜPHELİ', tooltip: 'Şüpheli' },
  { level: 3, icon: '➖', label: 'NÖTR', tooltip: 'Nötr' },
  { level: 4, icon: '✓', label: 'GÜVENLİ', tooltip: 'Güvenli' },
  { level: 5, icon: '✓✓', label: 'ÇOK GÜVENLİ', tooltip: 'Çok Güvenli' },
];

const DEFAULT_RATING = 3; // Nötr
const SAVE_DEBOUNCE_MS = 300;

// Component-local state
let selectedPlayerId = null;
let saveTimer = null;
let savedIndicatorTimer = null;

// ── localStorage CRUD ──────────────────────────────────────────

function getStorageKey() {
  const state = getState();
  return `spyhaz_notebook_${state.roomCode || 'unknown'}`;
}

function loadNotebookData() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotebookData(data) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

function getPlayerData(playerId) {
  const data = loadNotebookData();
  return data[playerId] || { rating: DEFAULT_RATING, notes: '' };
}

function setPlayerRating(playerId, rating) {
  const data = loadNotebookData();
  if (!data[playerId]) data[playerId] = { rating: DEFAULT_RATING, notes: '' };
  data[playerId].rating = rating;
  saveNotebookData(data);
}

function setPlayerNotes(playerId, notes) {
  const data = loadNotebookData();
  if (!data[playerId]) data[playerId] = { rating: DEFAULT_RATING, notes: '' };
  data[playerId].notes = notes;
  saveNotebookData(data);
}

// ── Render Functions ───────────────────────────────────────────

function renderRatingBar(playerId) {
  const { rating } = getPlayerData(playerId);
  return RATING_LEVELS.map(r => `
    <button class="notebook-rating-btn ${rating === r.level ? 'rating-active' : ''}"
            data-level="${r.level}"
            data-player="${playerId}"
            data-tooltip="${r.tooltip}"
            title="${r.tooltip}"
            aria-label="${r.tooltip}">
      ${r.icon}
    </button>
  `).join('');
}

function renderPlayerItem(player) {
  const isActive = selectedPlayerId === player.id;
  const { rating } = getPlayerData(player.id);
  const isSelf = player.id === getState().playerId;

  return `
    <div class="notebook-player-item ${isActive ? 'notebook-player-active' : ''}"
         data-notebook-player="${player.id}">
      <div class="notebook-player-avatar">${getInitials(player.name)}</div>
      <div class="notebook-player-info">
        <div class="notebook-player-name">${player.name}${isSelf ? ' (Sen)' : ''}</div>
      </div>
      <div class="notebook-rating-dot rating-${rating}"></div>
      <div class="notebook-rating" data-rating-for="${player.id}">
        ${renderRatingBar(player.id)}
      </div>
    </div>
  `;
}

function renderNotesPanel() {
  if (!selectedPlayerId) {
    return `
      <div class="notebook-empty">
        <div class="notebook-empty-icon">🔍</div>
        <div class="notebook-empty-text">
          BİR OYUNCU SEÇ<br>NOT ALMAYA BAŞLA
        </div>
      </div>
    `;
  }

  const state = getState();
  const player = state.players.find(p => p.id === selectedPlayerId);
  const { notes } = getPlayerData(selectedPlayerId);
  const playerName = player?.name || '?';

  return `
    <div class="notebook-notes-header">
      <div class="notebook-notes-title">
        📝 NOTLAR —
        <span class="notebook-notes-player">${playerName}</span>
      </div>
      <span class="notebook-notes-saved" id="notebook-saved">✓ Kaydedildi</span>
    </div>
    <textarea class="notebook-textarea"
              id="notebook-textarea"
              placeholder="${playerName} hakkında not al... (ör: 3. soruda garip cevap verdi, konumu bilmiyor gibi davrandı...)"
              aria-label="${playerName} için notlar">${notes}</textarea>
  `;
}

// ── Main Render ────────────────────────────────────────────────

export function renderNotebook(container) {
  const state = getState();
  const players = state.players.filter(p => p.id !== state.playerId);

  // Auto-select first player if none selected
  if (!selectedPlayerId && players.length > 0) {
    selectedPlayerId = players[0].id;
  }

  container.innerHTML = `
    <div class="notebook-content">
      <div class="notebook-players">
        <div class="notebook-players-title">👥 OYUNCULAR</div>
        ${players.map(p => renderPlayerItem(p)).join('')}
      </div>
      <div class="notebook-notes" id="notebook-notes-panel">
        ${renderNotesPanel()}
      </div>
    </div>
  `;

  attachNotebookListeners(container);
}

// ── Event Listeners (Delegation) ───────────────────────────────

function attachNotebookListeners(container) {
  // Player selection — event delegation
  container.addEventListener('click', (e) => {
    // Rating button click
    const ratingBtn = e.target.closest('.notebook-rating-btn');
    if (ratingBtn) {
      e.stopPropagation();
      const level = parseInt(ratingBtn.dataset.level);
      const playerId = ratingBtn.dataset.player;
      handleRatingClick(playerId, level, container);
      return;
    }

    // Player item click
    const playerItem = e.target.closest('.notebook-player-item');
    if (playerItem) {
      const playerId = playerItem.dataset.notebookPlayer;
      handlePlayerSelect(playerId, container);
      return;
    }
  });

  // Textarea input — debounced save
  container.addEventListener('input', (e) => {
    if (e.target.id === 'notebook-textarea' && selectedPlayerId) {
      debouncedSaveNotes(e.target.value);
    }
  });
}

function handlePlayerSelect(playerId, container) {
  if (selectedPlayerId === playerId) return;
  selectedPlayerId = playerId;

  // Update active state on player items
  container.querySelectorAll('.notebook-player-item').forEach(el => {
    el.classList.toggle('notebook-player-active', el.dataset.notebookPlayer === playerId);
  });

  // Re-render notes panel
  const notesPanel = container.querySelector('#notebook-notes-panel');
  if (notesPanel) {
    notesPanel.innerHTML = renderNotesPanel();
  }
}

function handleRatingClick(playerId, level, container) {
  setPlayerRating(playerId, level);

  // Update rating buttons for this player
  const ratingContainer = container.querySelector(`[data-rating-for="${playerId}"]`);
  if (ratingContainer) {
    ratingContainer.innerHTML = renderRatingBar(playerId);
  }

  // Update the colored dot
  const playerItem = container.querySelector(`[data-notebook-player="${playerId}"]`);
  if (playerItem) {
    const dot = playerItem.querySelector('.notebook-rating-dot');
    if (dot) {
      dot.className = `notebook-rating-dot rating-${level}`;
    }
  }
}

function debouncedSaveNotes(value) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (selectedPlayerId) {
      setPlayerNotes(selectedPlayerId, value);
      showSavedIndicator();
    }
  }, SAVE_DEBOUNCE_MS);
}

function showSavedIndicator() {
  const el = document.getElementById('notebook-saved');
  if (!el) return;
  el.classList.add('visible');
  clearTimeout(savedIndicatorTimer);
  savedIndicatorTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, 1500);
}

// ── Public API ─────────────────────────────────────────────────

export function updateNotebookPlayers() {
  const body = document.getElementById('notebook-body');
  if (!body || !body.children.length) return;
  renderNotebook(body);
}

export function initNotebookToggle(drawer) {
  if (!drawer) return;

  const tab = drawer.querySelector('#notebook-tab');
  if (!tab) return;

  tab.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('notebook-open');

    // Render content on first open
    const body = drawer.querySelector('#notebook-body');
    if (isOpen && body && !body.children.length) {
      renderNotebook(body);
    }
  });
}

// Cleanup on game end
export function clearNotebookState() {
  selectedPlayerId = null;
  clearTimeout(saveTimer);
  clearTimeout(savedIndicatorTimer);
}
