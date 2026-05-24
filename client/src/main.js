// ══════════════════════════════════════════════════════════════
// SPYHAZ - Main Entry Point
// ══════════════════════════════════════════════════════════════

// Styles
import './styles/index.css';
import './styles/home.css';
import './styles/lobby.css';
import './styles/game.css';
import './styles/vote.css';
import './styles/result.css';
import './styles/components.css';

// Core
import { initSocket, getSocket } from './socket.js';
import { registerRoute, initRouter, navigateTo, getCurrentScreen } from './router.js';
import { getState, setState, resetGameState } from './state.js';

// Screens
import { renderHome } from './screens/home.js';
import { renderLobby, updatePlayerList, updateLobbySettings } from './screens/lobby.js';
import { renderGame, updateTimer, updateQuestionSection, updateGamePlayers, updateSpyActions } from './screens/game.js';
import { showVoteRequest, handleVoteRequestResult, updateVotedPlayer, showVoteResults, removeVoteOverlay } from './screens/vote.js';
import { showSpyGuessResult } from './screens/spyGuess.js';
import { renderResult } from './screens/result.js';

// Utils
import { playSFX, toggleMute, getMuteState } from './utils/audio.js';

// Components
import { showToast } from './components/toast.js';
import { handleNewChatMessage } from './components/chat.js';

// ── Initialize ─────────────────────────────────────────────────
const socket = initSocket();

// Mute toggle listener
const muteBtn = document.getElementById('mute-toggle');
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    const isMuted = toggleMute();
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
  });
}

// ── Register Routes ────────────────────────────────────────────
registerRoute('home', renderHome);
registerRoute('lobby', (container) => renderLobby(container));
registerRoute('game', (container) => renderGame(container));

// ── Socket Event Handlers ──────────────────────────────────────

// Room events
socket.on('room:playerJoined', ({ player }) => {
  const state = getState();
  const players = [...state.players, player];
  setState({ players });
  if (getCurrentScreen() === 'lobby') updatePlayerList();
  showToast(`${player.name} odaya katıldı!`, 'info');
  playSFX.join();
});

socket.on('room:playerLeft', ({ playerId, newHostId, players }) => {
  const state = getState();
  const leavingPlayer = state.players.find(p => p.id === playerId);
  setState({
    players: players || state.players.filter(p => p.id !== playerId),
    isHost: newHostId ? newHostId === state.playerId : state.isHost,
  });
  if (getCurrentScreen() === 'lobby') updatePlayerList();
  if (leavingPlayer) showToast(`${leavingPlayer.name} ayrıldı.`, 'warning');
});

socket.on('room:settingsUpdated', ({ settings }) => {
  setState({ settings });
  if (getCurrentScreen() === 'lobby') updateLobbySettings();
  showToast('Ayarlar güncellendi.', 'info');
});

socket.on('room:playerDisconnected', ({ playerId, playerName }) => {
  showToast(`${playerName} bağlantısı koptu.`, 'warning');
  const state = getState();
  const updated = state.players.map(p =>
    p.id === playerId ? { ...p, connected: false } : p
  );
  setState({ players: updated });
  if (getCurrentScreen() === 'game') updateGamePlayers();
});

socket.on('room:error', ({ message }) => {
  showToast(message, 'error');
});

// Game started
socket.on('game:started', (data) => {
  setState({
    gameActive: true,
    role: data.role,
    isSpy: data.isSpy,
    location: data.location,
    locations: data.locations,
    players: data.players,
    spyGuessesLeft: data.spyGuessesLeft || 0,
    chatMessages: [],
    unreadCount: 0,
    chatCollapsed: false,
  });

  // Show role reveal overlay
  showRoleReveal();
  playSFX.start();
});

socket.on('game:allReady', () => {
  // Navigate to game screen when all players have seen their roles
  navigateTo('game');
});

// Question events
socket.on('question:turn', ({ askerId, askerName, availableTargets, round }) => {
  setState({
    currentAskerId: askerId,
    currentAskerName: askerName,
    availableTargets,
    questionRound: round,
    askedTarget: null,
  });
  if (getCurrentScreen() === 'game') {
    updateQuestionSection();
    updateGamePlayers();
  }

  // Notify if it's your turn
  if (askerId === getState().playerId) {
    showToast('Sıra sende! Kime soru sormak istiyorsun?', 'info');
    playSFX.turn();
  }
});

socket.on('question:asked', ({ askerId, askerName, targetId, targetName }) => {
  setState({ askedTarget: targetId });
  if (getCurrentScreen() === 'game') {
    updateQuestionSection();
    updateGamePlayers();
  }
});

socket.on('question:newRound', ({ round }) => {
  setState({ questionRound: round });
  showToast(`Yeni soru turu başladı! (Tur ${round})`, 'info');
});

// Timer events
socket.on('timer:update', ({ remaining, isPaused }) => {
  setState({ timerRemaining: remaining, timerPaused: isPaused });
  if (getCurrentScreen() === 'game') updateTimer();
  if (!isPaused && remaining <= 10 && remaining > 0) {
    playSFX.tick();
  }
});

socket.on('timer:expired', () => {
  showToast('⏱️ Süre doldu!', 'error');
  playSFX.alert();
});

// Vote events
socket.on('vote:requested', ({ requesterId, requesterName }) => {
  setState({ votePhase: 'REQUEST', voteRequesterId: requesterId, voteRequesterName: requesterName });
  showVoteRequest(requesterId, requesterName);
  playSFX.alert();
});

socket.on('vote:requestResult', ({ accepted, yes, no }) => {
  handleVoteRequestResult(accepted);
  if (!accepted) {
    setState({ votePhase: null });
  }
});

socket.on('vote:start', ({ players }) => {
  setState({ votePhase: 'VOTING', votedPlayers: new Set() });
});

socket.on('vote:playerVoted', ({ playerId }) => {
  updateVotedPlayer(playerId);
});

socket.on('vote:result', (data) => {
  showVoteResults(data);
});

// Spy guess events
socket.on('spy:guessResult', (data) => {
  showSpyGuessResult(data);
  if (getState().isSpy) {
    setState({ spyGuessesLeft: data.guessesLeft });
    if (getCurrentScreen() === 'game') updateSpyActions();
  }
});

// Game over
socket.on('game:over', (data) => {
  const app = document.getElementById('app');
  const state = getState();
  const won = (state.isSpy && data.winner === 'SPY') || (!state.isSpy && data.winner === 'PLAYERS');
  if (won) playSFX.win();
  else playSFX.lose();
  renderResult(app, data);
});

// Return to lobby
socket.on('game:returnedToLobby', ({ players, settings }) => {
  resetGameState();
  setState({ players, settings });
  navigateTo('lobby');
  showToast('Lobiye dönüldü!', 'info');
});

// Chat
socket.on('chat:message', (msg) => {
  handleNewChatMessage(msg);
});

// ── Role Reveal Overlay ────────────────────────────────────────
function showRoleReveal() {
  const state = getState();

  const overlay = document.createElement('div');
  overlay.className = 'reveal-overlay';
  overlay.id = 'reveal-overlay';

  if (state.isSpy) {
    overlay.innerHTML = `
      <div class="card reveal-card" style="border-color: var(--danger); box-shadow: var(--shadow-card), var(--shadow-danger);">
        <div class="reveal-emoji">🕵️</div>
        <div class="reveal-spy-title">SEN CASUSSUN!</div>
        <div class="reveal-spy-desc">Konumu bilmiyorsun. Diğer oyuncuların sorularından konumu çözmeye çalış!</div>
        <button class="btn btn-danger btn-pixel btn-block" id="reveal-ready" style="font-size:10px;">ANLADIM</button>
      </div>
    `;
  } else {
    overlay.innerHTML = `
      <div class="card reveal-card card-glow">
        <div class="reveal-emoji">${state.location.emoji}</div>
        <div class="reveal-location">${state.location.name}</div>
        <div class="reveal-role">${state.role}</div>
        <div class="divider"></div>
        <div style="color: var(--text-secondary); font-size: var(--fs-sm); margin-bottom: var(--sp-6);">
          Casusu bulmaya çalış! Konumu belli etmeden sorular sor.
        </div>
        <button class="btn btn-primary btn-pixel btn-block" id="reveal-ready" style="font-size:10px;">ANLADIM</button>
      </div>
    `;
  }

  document.body.appendChild(overlay);

  overlay.querySelector('#reveal-ready').addEventListener('click', () => {
    socket.emit('game:ready');
    overlay.querySelector('#reveal-ready').disabled = true;
    overlay.querySelector('#reveal-ready').textContent = 'DİĞERLERİ BEKLENİYOR...';

    // Remove overlay when game:allReady fires
    const checkReady = () => {
      const o = document.getElementById('reveal-overlay');
      if (o) o.remove();
    };
    socket.once('game:allReady', checkReady);
    // Fallback removal after 15s
    setTimeout(checkReady, 15000);
  });
}

// ── Start Router ───────────────────────────────────────────────
initRouter();

console.log('🕵️ Spyhaz initialized');
