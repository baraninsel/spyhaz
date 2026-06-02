// Result Screen - Game over
import { getSocket } from '../socket.js';
import { getState, setState, resetGameState, clearSession } from '../state.js';
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

  // Build scoreboard
  const roundScores = data.roundScores || {};
  const totalScores = data.totalScores || {};
  const roundNumber = data.roundNumber || 1;

  // Sort players by total score descending
  const sortedPlayers = [...state.players].sort((a, b) => (totalScores[b.id] || 0) - (totalScores[a.id] || 0));

  const scoreboardHTML = sortedPlayers.map((p, idx) => {
    const roundPts = roundScores[p.id] || 0;
    const totalPts = totalScores[p.id] || 0;
    const isSpy = data.roles?.[p.id]?.isSpy;
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
    const color = getAvatarColor(p.name);
    return `
      <div class="score-row ${p.id === state.playerId ? 'score-row-me' : ''}">
        <div class="score-rank">${medal || (idx + 1)}</div>
        <div class="score-player">
          <span class="player-avatar" style="background: ${color}; width: 24px; height: 24px; font-size: 9px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;">
            ${getInitials(p.name)}
          </span>
          <span>${p.name}</span>
          ${isSpy ? '<span class="badge badge-danger" style="font-size: 7px; padding: 1px 4px;">CASUS</span>' : ''}
        </div>
        <div class="score-round ${roundPts > 0 ? 'score-positive' : ''}">+${roundPts}</div>
        <div class="score-total">${totalPts}</div>
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

        <!-- Scoreboard -->
        <div class="divider"></div>
        <div class="result-scoreboard">
          <div class="lobby-section-title" style="margin-bottom: var(--sp-3);">🏆 SKOR TABLOSU — Tur ${roundNumber}</div>
          <div class="score-header">
            <div class="score-rank"></div>
            <div class="score-player">Oyuncu</div>
            <div class="score-round">Tur</div>
            <div class="score-total">Toplam</div>
          </div>
          ${scoreboardHTML}
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
    clearSession();
    setState({ roomCode: null, players: [], isHost: false });
    navigateTo('home');
  });
}

