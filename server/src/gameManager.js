// Game Manager - core game logic, role assignment, timer, state machine
import { locations } from './data/locations.js';
import { initQuestionRound, getAvailableTargets } from './questionManager.js';

export function startGame(room) {
  const players = room.players;
  if (players.length < 3) return { error: 'En az 3 oyuncu gerekli.' };
  if (players.length > 8) return { error: 'En fazla 8 oyuncu olabilir.' };

  // Filter locations based on enabled settings
  const enabledIds = new Set(room.settings.enabledLocationIds || locations.map(l => l.id));
  const enabledLocations = locations.filter(l => enabledIds.has(l.id));
  if (enabledLocations.length < 10) return { error: 'En az 10 konum etkin olmalı.' };

  // Filter out previous location if possible
  let availableLocations = enabledLocations.filter(l => l.id !== room.previousLocationId);
  if (availableLocations.length === 0) {
    availableLocations = enabledLocations; // Fallback if no other locations enabled
  }

  // Pick random location from available ones
  const locationIdx = Math.floor(Math.random() * availableLocations.length);
  const location = availableLocations[locationIdx];

  // Save as previous location for the next game
  room.previousLocationId = location.id;

  // Pick random spy
  const spyIdx = Math.floor(Math.random() * players.length);
  const spyId = players[spyIdx].id;

  // Assign roles to non-spy players (shuffle roles and assign)
  // Fisher-Yates shuffle (unbiased)
  const shuffledRoles = [...location.roles];
  for (let i = shuffledRoles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
  }
  const roles = {};
  let roleIdx = 0;
  for (const player of players) {
    if (player.id === spyId) {
      roles[player.id] = { role: 'CASUS', isSpy: true };
    } else {
      roles[player.id] = {
        role: shuffledRoles[roleIdx % shuffledRoles.length],
        isSpy: false,
      };
      roleIdx++;
    }
  }

  // Initialize question round
  const questionState = initQuestionRound(players);

  // Set up game state
  room.game = {
    state: 'ROLE_REVEAL',
    location: {
      id: location.id,
      name: location.name,
      emoji: location.emoji,
    },
    spyId,
    roles,
    readyPlayers: new Set(),
    questionState,
    voteState: null,
    timer: {
      duration: room.settings.duration,
      remaining: room.settings.duration,
      isPaused: false,
      intervalId: null,
    },
    spyGuessesLeft: room.settings.spyGuessCount,
    allLocations: enabledLocations.map(l => ({ id: l.id, name: l.name, emoji: l.emoji })),
  };

  return { success: true, game: room.game };
}

export function getPlayerGameData(room, playerId) {
  const game = room.game;
  if (!game) return null;

  const playerRole = game.roles[playerId];
  const isSpy = playerRole.isSpy;

  return {
    role: playerRole.role,
    isSpy,
    location: isSpy ? null : game.location,
    locations: game.allLocations,
    state: game.state,
    spyGuessesLeft: isSpy ? game.spyGuessesLeft : undefined,
    previousLocationId: room.previousLocationId,
  };
}

export function markReady(room, playerId) {
  const game = room.game;
  if (!game || game.state !== 'ROLE_REVEAL') return false;

  game.readyPlayers.add(playerId);

  if (game.readyPlayers.size >= room.players.length) {
    game.state = 'PLAYING';
    return true; // all ready
  }
  return false;
}

export function startTimer(room, io, roomCode) {
  const game = room.game;
  if (!game) return;

  if (game.timer.intervalId) clearInterval(game.timer.intervalId);

  game.timer.intervalId = setInterval(() => {
    if (game.timer.isPaused || game.state !== 'PLAYING') return;

    game.timer.remaining -= 1;

    // Broadcast timer update every second
    io.to(roomCode).emit('timer:update', {
      remaining: game.timer.remaining,
      isPaused: game.timer.isPaused,
    });

    if (game.timer.remaining <= 0) {
      clearInterval(game.timer.intervalId);
      game.timer.intervalId = null;
      // Time's up - spy wins
      endGame(room, io, roomCode, 'SPY', 'Süre doldu! Casus kazandı.', 'TIMER_EXPIRED');
    }
  }, 1000);
}

export function pauseTimer(room) {
  if (!room.game) return false;
  room.game.timer.isPaused = true;
  return true;
}

export function resumeTimer(room) {
  if (!room.game) return false;
  room.game.timer.isPaused = false;
  return true;
}

export function handleSpyGuess(room, playerId, locationId) {
  const game = room.game;
  if (!game) return { error: 'Oyun aktif değil.' };
  if (game.roles[playerId]?.isSpy !== true) return { error: 'Sadece casus tahmin yapabilir.' };
  if (game.spyGuessesLeft <= 0) return { error: 'Tahmin hakkınız kalmadı.' };

  game.spyGuessesLeft -= 1;

  const correct = game.location.id === locationId;
  const guessedLocation = game.allLocations.find(l => l.id === locationId);

  return {
    correct,
    guessedLocationName: guessedLocation?.name || '?',
    guessesLeft: game.spyGuessesLeft,
  };
}

export function endGame(room, io, roomCode, winner, reason, scoreReason, voteRequesterId = null) {
  const game = room.game;
  if (!game) return;

  // Clean up timer
  if (game.timer.intervalId) {
    clearInterval(game.timer.intervalId);
    game.timer.intervalId = null;
  }

  game.state = 'GAME_OVER';
  room.roundNumber = (room.roundNumber || 0) + 1;

  const spyPlayer = room.players.find(p => p.id === game.spyId);

  // Build roles map with player names
  const rolesDetail = {};
  for (const player of room.players) {
    rolesDetail[player.id] = {
      name: player.name,
      role: game.roles[player.id]?.role || '?',
      isSpy: game.roles[player.id]?.isSpy || false,
    };
  }

  // ── Score Calculation ──────────────────────────────────────────
  // scoreReason: TIMER_EXPIRED | WRONG_INDICTMENT | CORRECT_INDICTMENT | SPY_GUESS_CORRECT | SPY_GUESS_EXHAUSTED
  const roundScores = {};
  for (const p of room.players) roundScores[p.id] = 0;

  if (winner === 'SPY') {
    switch (scoreReason) {
      case 'TIMER_EXPIRED':
        roundScores[game.spyId] = 2;
        break;
      case 'WRONG_INDICTMENT':
        roundScores[game.spyId] = 4;
        break;
      case 'SPY_GUESS_CORRECT':
        roundScores[game.spyId] = 4;
        break;
    }
  } else {
    // PLAYERS win
    for (const p of room.players) {
      if (p.id === game.spyId) continue;
      if (scoreReason === 'CORRECT_INDICTMENT' && p.id === voteRequesterId) {
        roundScores[p.id] = 2; // Vote initiator gets 2
      } else {
        roundScores[p.id] = 1; // Others get 1
      }
    }
  }

  // Accumulate in room.scores
  if (!room.scores) room.scores = {};
  for (const [id, pts] of Object.entries(roundScores)) {
    room.scores[id] = (room.scores[id] || 0) + pts;
  }

  io.to(roomCode).emit('game:over', {
    winner, // 'SPY' or 'PLAYERS'
    reason,
    spyId: game.spyId,
    spyName: spyPlayer?.name || '?',
    location: game.location,
    roles: rolesDetail,
    roundScores,
    totalScores: { ...room.scores },
    roundNumber: room.roundNumber,
  });
}

export function resetGame(room) {
  if (room.game?.timer?.intervalId) {
    clearInterval(room.game.timer.intervalId);
  }
  room.game = null;
  // scores and roundNumber persist across rounds
}
