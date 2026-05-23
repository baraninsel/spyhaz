// Vote Screen - Two-phase voting overlay
import { getSocket } from '../socket.js';
import { getState, setState } from '../state.js';
import { renderPlayerList, getAvatarColor, getInitials } from '../components/playerList.js';

export function showVoteRequest(requesterId, requesterName) {
  const state = getState();
  const isRequester = requesterId === state.playerId;

  const overlay = document.createElement('div');
  overlay.className = 'vote-overlay';
  overlay.id = 'vote-overlay';

  if (isRequester) {
    overlay.innerHTML = `
      <div class="card vote-container vote-request">
        <div class="vote-request-icon">🗳️</div>
        <div class="vote-request-title">OYLAMA TALEBİ GÖNDERDİN</div>
        <div class="vote-request-waiting">Diğer oyuncuların cevabı bekleniyor...</div>
      </div>
    `;
  } else {
    overlay.innerHTML = `
      <div class="card vote-container vote-request">
        <div class="vote-request-icon">🗳️</div>
        <div class="vote-request-title">OYLAMA TALEBİ</div>
        <div class="vote-request-name">${requesterName}</div>
        <div style="color: var(--text-secondary); margin-bottom: var(--sp-6);">oylama başlatmak istiyor</div>
        <div class="vote-request-actions">
          <button class="btn btn-primary btn-lg" id="vote-accept">✓ EVET</button>
          <button class="btn btn-danger btn-lg" id="vote-reject">✕ HAYIR</button>
        </div>
      </div>
    `;

    overlay.querySelector('#vote-accept').addEventListener('click', () => {
      getSocket().emit('vote:respond', { accept: true });
      overlay.querySelector('.vote-request-actions').innerHTML = `
        <div class="vote-request-waiting">Diğer oyuncuların cevabı bekleniyor...</div>
      `;
    });

    overlay.querySelector('#vote-reject').addEventListener('click', () => {
      getSocket().emit('vote:respond', { accept: false });
      overlay.querySelector('.vote-request-actions').innerHTML = `
        <div class="vote-request-waiting">Diğer oyuncuların cevabı bekleniyor...</div>
      `;
    });
  }

  document.body.appendChild(overlay);
}

export function handleVoteRequestResult(accepted) {
  const overlay = document.getElementById('vote-overlay');
  if (!accepted) {
    // Vote rejected
    if (overlay) {
      overlay.innerHTML = `
        <div class="card vote-container vote-request" style="text-align: center;">
          <div class="vote-request-icon">❌</div>
          <div class="vote-request-title">OYLAMA REDDEDİLDİ</div>
          <div style="color: var(--text-secondary);">Çoğunluk oylama istemedi. Oyun devam ediyor.</div>
        </div>
      `;
      setTimeout(() => overlay.remove(), 2000);
    }
    return;
  }

  // Vote accepted - show voting phase
  if (overlay) overlay.remove();
  showVotingPhase();
}

function showVotingPhase() {
  const state = getState();
  setState({ votePhase: 'VOTING', selectedSuspect: null, votedPlayers: new Set() });

  const overlay = document.createElement('div');
  overlay.className = 'vote-overlay';
  overlay.id = 'vote-overlay';

  const otherPlayers = state.players.filter(p => p.id !== state.playerId);

  overlay.innerHTML = `
    <div class="card vote-container vote-phase">
      <div class="vote-phase-title">🕵️ CASUS KİM?</div>
      <div class="vote-player-grid" id="vote-player-grid">
        ${otherPlayers.map(p => `
          <div class="vote-player-option" data-player-id="${p.id}">
            <div class="player-avatar" style="background: ${getAvatarColor(p.name)}">${getInitials(p.name)}</div>
            <span class="player-name">${p.name}</span>
            <div class="vote-check"></div>
          </div>
        `).join('')}
      </div>
      <div class="vote-voted-indicator" id="vote-indicators">
        ${state.players.map(() => '<div class="voted-dot"></div>').join('')}
      </div>
      <div style="text-align: center; margin-top: var(--sp-4);">
        <button class="btn btn-danger btn-pixel btn-lg" id="vote-confirm" disabled style="font-size:10px;">
          OY VER
        </button>
      </div>
    </div>
  `;

  let selectedId = null;

  overlay.querySelectorAll('.vote-player-option').forEach(option => {
    option.addEventListener('click', () => {
      overlay.querySelectorAll('.vote-player-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedId = option.dataset.playerId;
      overlay.querySelector('#vote-confirm').disabled = false;
    });
  });

  overlay.querySelector('#vote-confirm').addEventListener('click', () => {
    if (!selectedId) return;
    getSocket().emit('vote:cast', { suspectId: selectedId });
    overlay.querySelector('#vote-confirm').disabled = true;
    overlay.querySelector('#vote-confirm').textContent = 'BEKLENİYOR...';
    // Disable all options
    overlay.querySelectorAll('.vote-player-option').forEach(o => {
      o.style.pointerEvents = 'none';
      o.style.opacity = '0.6';
    });
  });

  document.body.appendChild(overlay);
}

export function updateVotedPlayer(playerId) {
  const state = getState();
  state.votedPlayers.add(playerId);

  const indicators = document.querySelectorAll('#vote-indicators .voted-dot');
  let idx = 0;
  for (const dot of indicators) {
    if (idx < state.votedPlayers.size) {
      dot.classList.add('done');
    }
    idx++;
  }
}

export function showVoteResults(data) {
  const overlay = document.getElementById('vote-overlay');
  if (!overlay) return;

  const state = getState();

  // Build results bars
  const counts = data.counts || {};
  const maxCount = Math.max(...Object.values(counts), 1);

  const bars = state.players
    .filter(p => counts[p.id])
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
    .map(p => {
      const count = counts[p.id] || 0;
      const pct = (count / state.players.length) * 100;
      const isAccused = p.id === data.accusedId;
      return `
        <div class="vote-result-bar">
          <span class="vote-result-name ${isAccused ? 'text-danger' : ''}">${p.name}</span>
          <div class="vote-result-fill">
            <div class="vote-result-fill-inner" style="width: ${pct}%">
              <span class="vote-result-count">${count}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

  overlay.innerHTML = `
    <div class="card vote-container vote-results">
      <div class="vote-result-title">
        ${data.isSpy
          ? '<span class="text-success">✅ DOĞRU TAHMİN!</span><br>${data.accusedName} casustu!'
          : '<span class="text-danger">❌ YANLIŞ TAHMİN!</span><br>${data.accusedName} casus değildi!'}
      </div>
      <div class="vote-result-bars">${bars}</div>
    </div>
  `;

  // Auto-remove after game:over event
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 5000);
}

export function removeVoteOverlay() {
  const overlay = document.getElementById('vote-overlay');
  if (overlay) overlay.remove();
}
