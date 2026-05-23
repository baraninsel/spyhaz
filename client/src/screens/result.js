// Result Screen - Game over
import { getSocket } from '../socket.js';
import { getState, setState, resetGameState } from '../state.js';
import { navigateTo } from '../router.js';
import { saveGameToHistory } from '../utils/history.js';
import { getAvatarColor, getInitials } from '../components/playerList.js';
import { removeVoteOverlay } from './vote.js';

export function renderResult(container, data) {
  removeVoteOverlay();

  const state = getState();
  const isSpyWin = data.winner === 'SPY';
  const iWasSpy = state.isSpy;
  const iWon = (iWasSpy && isSpyWin) || (!iWasSpy && !isSpyWin);

  // Save to history
  saveGameToHistory({
    location: data.location,
    role: state.role,
    isSpy: iWasSpy,
    winner: data.winner,
    reason: data.reason,
    playerCount: state.players.length,
  });

  // Build roles list
  const rolesHTML = Object.entries(data.roles || {}).map(([id, info]) => {
    const color = getAvatarColor(info.name);
    return `
      <div class="result-role-item ${info.isSpy ? 'is-spy' : ''}">
        <span style="display: flex; align-items: center; gap: var(--sp-2);">
          <span class="player-avatar" style="background: ${color}; width: 28px; height: 28px; font-size: 10px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;">
            ${getInitials(info.name)}
          </span>
          <span class="result-role-name">${info.name}</span>
        </span>
        <span class="result-role-value ${info.isSpy ? 'text-danger' : ''}">
          ${info.isSpy ? '🕵️ CASUS' : info.role}
        </span>
      </div>
    `;
  }).join('');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="result-screen">
      <div class="card result-card card-glow">
        <div class="result-icon">${isSpyWin ? '🕵️' : '🎉'}</div>
        <div class="result-title ${isSpyWin ? 'spy-wins' : 'players-win'}">
          ${isSpyWin ? 'CASUS KAZANDI!' : 'OYUNCULAR KAZANDI!'}
        </div>
        <div class="result-reason">${data.reason}</div>

        ${iWon
          ? '<div class="badge badge-success mb-6" style="font-size: var(--fs-sm); padding: 6px 16px;">🏆 Kazandın!</div>'
          : '<div class="badge badge-danger mb-6" style="font-size: var(--fs-sm); padding: 6px 16px;">💀 Kaybettin!</div>'
        }

        <div class="result-spy-reveal">
          <div class="result-spy-label">CASUS</div>
          <div class="result-spy-name">🕵️ ${data.spyName}</div>
        </div>

        <div class="result-location">
          <div class="result-location-emoji">${data.location?.emoji || '📍'}</div>
          <div class="result-location-name">${data.location?.name || '?'}</div>
          <div class="divider"></div>
          <div class="result-roles">${rolesHTML}</div>
        </div>

        <div class="result-actions">
          <button class="btn btn-primary btn-pixel" id="btn-replay" style="font-size:9px;">TEKRAR OYNA</button>
          <button class="btn btn-ghost" id="btn-exit">Çıkış</button>
        </div>
      </div>
    </div>
  `;

  app.querySelector('#btn-replay').addEventListener('click', () => {
    resetGameState();
    getSocket().emit('game:returnToLobby');
  });

  app.querySelector('#btn-exit').addEventListener('click', () => {
    getSocket().emit('room:leave');
    resetGameState();
    setState({ roomCode: null, players: [], isHost: false });
    navigateTo('home');
  });
}
