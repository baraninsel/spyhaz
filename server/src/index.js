// Spyhaz Server - Express + Socket.IO
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createRoom, joinRoom, leaveRoom, disconnectPlayer,
  getRoom, getPublicPlayers, deleteRoom,
  reconnectPlayer, findRoomByPlayerId, getPlayerBySocketId
} from './roomManager.js';
import {
  startGame, getPlayerGameData, markReady,
  startTimer, pauseTimer, resumeTimer,
  handleSpyGuess, endGame, resetGame
} from './gameManager.js';
import {
  getAvailableTargets, selectTarget, completeTurn, removePlayer as removeQuestionPlayer
} from './questionManager.js';
import {
  createVoteRequest, respondToRequest, checkRequestResult,
  startVoting, castVote, checkVoteResult
} from './voteManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());

// Serve static files in production
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(join(clientDist, 'index.html'));
});

// Track which room each socket is in, and which player it belongs to
const socketRooms = new Map();   // socketId -> roomCode
const socketToPlayer = new Map(); // socketId -> playerId

// Helper: resolve playerId from socket
function resolvePlayerId(socket) {
  return socketToPlayer.get(socket.id) || null;
}

function getPlayerName(room, playerId) {
  return room.players.find(p => p.id === playerId)?.name || '?';
}

// Helper: get player's socketId from room
function getPlayerSocketId(room, playerId) {
  return room.players.find(p => p.id === playerId)?.socketId || null;
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── ROOM EVENTS ───────────────────────────────────────────────
  socket.on('room:create', ({ settings, playerName }, callback) => {
    const result = createRoom(socket.id, playerName, settings);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }
    const { room, playerId, reconnectToken } = result;
    socket.join(room.code);
    socketRooms.set(socket.id, room.code);
    socketToPlayer.set(socket.id, playerId);

    callback?.({
      success: true,
      code: room.code,
      playerId,
      reconnectToken,
      settings: room.settings,
      players: getPublicPlayers(room),
    });
    console.log(`[ROOM] Created: ${room.code} by ${playerName} (${playerId})`);
  });

  socket.on('room:join', ({ code, playerName }, callback) => {
    const normalizedCode = code.toUpperCase().trim();
    const result = joinRoom(normalizedCode, socket.id, playerName);

    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    const room = result.room;
    const playerId = result.playerId;
    socket.join(room.code);
    socketRooms.set(socket.id, room.code);
    socketToPlayer.set(socket.id, playerId);

    // Notify others
    socket.to(room.code).emit('room:playerJoined', {
      player: { id: playerId, name: playerName, connected: true, isHost: false },
    });

    callback?.({
      success: true,
      code: room.code,
      playerId,
      reconnectToken: result.reconnectToken,
      settings: room.settings,
      players: getPublicPlayers(room),
      hostId: room.hostId,
    });
    console.log(`[ROOM] ${playerName} joined ${room.code} (${playerId})`);
  });

  // ── RECONNECT ─────────────────────────────────────────────────
  socket.on('room:reconnect', ({ playerId, roomCode, playerName, reconnectToken }, callback) => {
    console.log(`[RECONNECT] Attempt: ${playerName} -> ${roomCode} (${playerId})`);

    if (!playerId || !roomCode) {
      callback?.({ success: false, error: 'Eksik oturum bilgisi.' });
      return;
    }

    const result = reconnectPlayer(roomCode, playerId, socket.id, reconnectToken || null);
    if (result.error) {
      console.log(`[RECONNECT] Failed: ${result.error}`);
      callback?.({ success: false, error: result.error });
      return;
    }

    const room = result.room;
    const player = result.player;
    const newReconnectToken = result.reconnectToken; // Token rotation

    // Update tracking maps
    socket.join(room.code);
    socketRooms.set(socket.id, room.code);
    socketToPlayer.set(socket.id, playerId);

    // Notify other players about reconnection
    socket.to(room.code).emit('room:playerReconnected', {
      playerId,
      playerName: player.name,
    });

    // Determine current game state and send appropriate data
    const gameState = room.game ? room.game.state : 'LOBBY';

    if (!room.game || gameState === 'LOBBY') {
      // In lobby - send lobby state
      callback?.({
        success: true,
        screen: 'lobby',
        code: room.code,
        playerId,
        reconnectToken: newReconnectToken,
        settings: room.settings,
        players: getPublicPlayers(room),
        hostId: room.hostId,
        isHost: room.hostId === playerId,
        chat: room.chat.slice(-50), // Send last 50 messages
      });
    } else if (gameState === 'GAME_OVER') {
      // Game is over - send back to lobby
      callback?.({
        success: true,
        screen: 'lobby',
        code: room.code,
        playerId,
        reconnectToken: newReconnectToken,
        settings: room.settings,
        players: getPublicPlayers(room),
        hostId: room.hostId,
        isHost: room.hostId === playerId,
        chat: room.chat.slice(-50),
      });
    } else {
      // Game is active (ROLE_REVEAL, PLAYING, VOTE_REQUEST, VOTING)
      const gameData = getPlayerGameData(room, playerId);
      const qs = room.game.questionState;

      callback?.({
        success: true,
        screen: 'game',
        code: room.code,
        playerId,
        reconnectToken: newReconnectToken,
        settings: room.settings,
        players: getPublicPlayers(room),
        hostId: room.hostId,
        isHost: room.hostId === playerId,
        chat: room.chat.slice(-50),
        // Game-specific data
        gameData: {
          ...gameData,
          timerRemaining: room.game.timer.remaining,
          timerPaused: room.game.timer.isPaused,
          currentAskerId: qs?.currentAskerId || null,
          currentAskerName: qs?.currentAskerId ? getPlayerName(room, qs.currentAskerId) : '',
          availableTargets: qs ? getAvailableTargets(qs) : [],
          questionRound: qs?.round || 1,
          votePhase: room.game.voteState?.phase || null,
          voteRequesterId: room.game.voteState?.requesterId || null,
          voteRequesterName: room.game.voteState?.requesterId
            ? getPlayerName(room, room.game.voteState.requesterId) : '',
        },
      });
    }

    console.log(`[RECONNECT] Success: ${player.name} -> ${room.code} (state: ${gameState})`);
  });

  socket.on('room:updateSettings', ({ settings }) => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return;
    if (room.hostId !== playerId) return;
    if (room.game && room.game.state !== 'LOBBY') return;

    // Update settings
    if (settings.duration) room.settings.duration = settings.duration;
    if (settings.spyGuessCount) room.settings.spyGuessCount = settings.spyGuessCount;
    if (settings.enabledLocationIds) room.settings.enabledLocationIds = settings.enabledLocationIds;

    // Broadcast to all players
    socket.to(code).emit('room:settingsUpdated', { settings: room.settings });
  });

  socket.on('room:leave', () => {
    handleLeave(socket);
  });

  // ── GAME EVENTS ───────────────────────────────────────────────
  socket.on('game:start', (_, callback) => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return callback?.({ error: 'Oda bulunamadı.' });
    if (room.hostId !== playerId) return callback?.({ error: 'Sadece oda sahibi oyunu başlatabilir.' });
    if (room.players.length < 3) return callback?.({ error: 'En az 3 oyuncu gerekli.' });

    const result = startGame(room);
    if (result.error) return callback?.({ error: result.error });

    // Send each player their own role data
    for (const player of room.players) {
      const gameData = getPlayerGameData(room, player.id);
      io.to(player.socketId).emit('game:started', {
        ...gameData,
        players: getPublicPlayers(room),
      });
    }

    callback?.({ success: true });
    console.log(`[GAME] Started in ${code}, spy: ${room.game.spyId}`);
  });

  socket.on('game:ready', () => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game) return;

    const allReady = markReady(room, playerId);
    if (allReady) {
      // Start the game timer and send first question turn
      startTimer(room, io, code);

      const qs = room.game.questionState;
      const available = getAvailableTargets(qs);
      io.to(code).emit('game:allReady', {});
      io.to(code).emit('question:turn', {
        askerId: qs.currentAskerId,
        askerName: getPlayerName(room, qs.currentAskerId),
        availableTargets: available,
        round: qs.round,
      });

      io.to(code).emit('timer:update', {
        remaining: room.game.timer.remaining,
        isPaused: false,
      });
    }
  });

  // ── QUESTION EVENTS ───────────────────────────────────────────
  socket.on('question:select', ({ targetId }, callback) => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;

    const qs = room.game.questionState;
    if (qs.currentAskerId !== playerId) {
      return callback?.({ error: 'Sıra sizde değil.' });
    }

    const result = selectTarget(qs, targetId);
    if (result.error) return callback?.({ error: result.error });

    io.to(code).emit('question:asked', {
      askerId: playerId,
      askerName: getPlayerName(room, playerId),
      targetId,
      targetName: getPlayerName(room, targetId),
    });

    callback?.({ success: true });
  });

  socket.on('question:done', () => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;

    const qs = room.game.questionState;
    // Only the asker can complete the turn
    if (qs.currentAskerId !== playerId) return;

    // Guard: a target must have been selected first
    if (qs.askedPlayerIds.length === 0) return;

    const result = completeTurn(qs);

    if (result.roundComplete) {
      io.to(code).emit('question:newRound', { round: qs.round });
    }

    // Send next turn info
    const available = getAvailableTargets(qs);
    io.to(code).emit('question:turn', {
      askerId: qs.currentAskerId,
      askerName: getPlayerName(room, qs.currentAskerId),
      availableTargets: available,
      round: qs.round,
    });
  });

  // ── VOTE EVENTS ───────────────────────────────────────────────
  socket.on('vote:request', () => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;
    if (room.game.voteState) return; // vote already in progress

    room.game.state = 'VOTE_REQUEST';
    room.game.voteState = createVoteRequest(playerId);
    room.game.voteRequesterId = playerId; // track for scoring

    // Pause timer during voting
    pauseTimer(room);
    io.to(code).emit('timer:update', {
      remaining: room.game.timer.remaining,
      isPaused: true,
    });

    io.to(code).emit('vote:requested', {
      requesterId: playerId,
      requesterName: getPlayerName(room, playerId),
    });
  });

  socket.on('vote:respond', ({ accept }) => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game?.voteState || room.game.voteState.phase !== 'REQUEST') return;

    respondToRequest(room.game.voteState, playerId, accept);

    const connectedCount = room.players.filter(p => p.connected !== false).length;
    const result = checkRequestResult(room.game.voteState, connectedCount);
    if (!result.complete) return;

    if (result.accepted) {
      // Start actual voting
      room.game.state = 'VOTING';
      room.game.voteState = startVoting();

      io.to(code).emit('vote:requestResult', { accepted: true, yes: result.yes, no: result.no });
      io.to(code).emit('vote:start', {
        players: getPublicPlayers(room),
      });
    } else {
      // Vote request rejected - resume game
      room.game.state = 'PLAYING';
      room.game.voteState = null;
      resumeTimer(room);

      io.to(code).emit('vote:requestResult', { accepted: false, yes: result.yes, no: result.no });
      io.to(code).emit('timer:update', {
        remaining: room.game.timer.remaining,
        isPaused: false,
      });
    }
  });

  socket.on('vote:cast', ({ suspectId }) => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game?.voteState || room.game.voteState.phase !== 'VOTING') return;

    const voteResult = castVote(room.game.voteState, playerId, suspectId);
    if (voteResult.error) return; // self-vote blocked

    // Notify others that this player voted (without revealing who)
    io.to(code).emit('vote:playerVoted', { playerId });

    const connectedCount = room.players.filter(p => p.connected !== false).length;
    const result = checkVoteResult(room.game.voteState, connectedCount);
    if (!result.complete) return;

    // Tie handling — no accusation, resume game
    if (result.isTie) {
      room.game.state = 'PLAYING';
      room.game.voteState = null;
      resumeTimer(room);

      io.to(code).emit('vote:result', {
        votes: result.votesDetail,
        counts: result.counts,
        accusedId: null,
        accusedName: null,
        isSpy: false,
        isTie: true,
      });
      io.to(code).emit('timer:update', {
        remaining: room.game.timer.remaining,
        isPaused: false,
      });
      return;
    }

    // Voting complete - check result
    const accusedIsSpy = result.accusedId === room.game.spyId;

    io.to(code).emit('vote:result', {
      votes: result.votesDetail,
      counts: result.counts,
      accusedId: result.accusedId,
      accusedName: getPlayerName(room, result.accusedId),
      isSpy: accusedIsSpy,
    });

    // Short delay then end game
    setTimeout(() => {
      if (accusedIsSpy) {
        endGame(room, io, code, 'PLAYERS', 'Casus doğru tahmin edildi!', 'CORRECT_INDICTMENT', room.game?.voteRequesterId);
      } else {
        endGame(room, io, code, 'SPY', 'Yanlış kişi suçlandı! Casus kazandı.', 'WRONG_INDICTMENT');
      }
    }, 3000);
  });

  // ── SPY GUESS ─────────────────────────────────────────────────
  socket.on('spy:guess', ({ locationId }, callback) => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;

    const result = handleSpyGuess(room, playerId, locationId);
    if (result.error) return callback?.({ error: result.error });

    io.to(code).emit('spy:guessResult', {
      correct: result.correct,
      guessedLocationName: result.guessedLocationName,
      spyId: playerId,
      spyName: getPlayerName(room, playerId),
      guessesLeft: result.guessesLeft,
    });

    if (result.correct) {
      setTimeout(() => {
        endGame(room, io, code, 'SPY', 'Casus konumu doğru tahmin etti!', 'SPY_GUESS_CORRECT');
      }, 2000);
    } else if (result.guessesLeft <= 0) {
      setTimeout(() => {
        endGame(room, io, code, 'PLAYERS', 'Casus tahmin hakkını tüketti!', 'SPY_GUESS_EXHAUSTED');
      }, 2000);
    }

    callback?.({ success: true, ...result });
  });

  // ── TIMER ─────────────────────────────────────────────────────
  socket.on('timer:pause', () => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game) return;
    if (room.hostId !== playerId) return;

    pauseTimer(room);
    io.to(code).emit('timer:update', {
      remaining: room.game.timer.remaining,
      isPaused: true,
    });
  });

  socket.on('timer:resume', () => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game) return;
    if (room.hostId !== playerId) return;

    resumeTimer(room);
    io.to(code).emit('timer:update', {
      remaining: room.game.timer.remaining,
      isPaused: false,
    });
  });

  // ── CHAT ──────────────────────────────────────────────────────
  socket.on('chat:send', ({ message }) => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return;
    if (!message || message.trim().length === 0) return;

    const chatMsg = {
      senderId: playerId,
      senderName: getPlayerName(room, playerId),
      message: message.trim().replace(/[<>]/g, '').slice(0, 300), // max 300 chars, strip HTML tags
      time: Date.now(),
    };

    room.chat.push(chatMsg);
    // Keep last 100 messages
    if (room.chat.length > 100) room.chat.shift();

    io.to(code).emit('chat:message', chatMsg);
  });

  // ── RETURN TO LOBBY ───────────────────────────────────────────
  socket.on('game:returnToLobby', () => {
    const playerId = resolvePlayerId(socket);
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return;
    if (room.hostId !== playerId) return;

    resetGame(room);
    io.to(code).emit('game:returnedToLobby', {
      players: getPublicPlayers(room),
      settings: room.settings,
      scores: room.scores || {},
      roundNumber: room.roundNumber || 0,
    });
  });

  // ── DISCONNECT ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    handleLeave(socket);
  });
});

function handleLeave(socket) {
  const code = socketRooms.get(socket.id);
  const playerId = socketToPlayer.get(socket.id);
  if (!code || !playerId) {
    socketRooms.delete(socket.id);
    socketToPlayer.delete(socket.id);
    return;
  }

  const room = getRoom(code);
  if (!room) {
    socketRooms.delete(socket.id);
    socketToPlayer.delete(socket.id);
    return;
  }

  // If game is active, mark as disconnected but don't remove
  // (they might reconnect - F5, tab close, browser close)
  if (room.game && room.game.state !== 'GAME_OVER' && room.game.state !== 'LOBBY') {
    disconnectPlayer(code, playerId);
    socket.to(code).emit('room:playerDisconnected', {
      playerId,
      playerName: getPlayerName(room, playerId),
    });

    // Oyun aktifken grace period yok — oyuncu disconnect olarak kalır ama silinmez
    // Oyun bitene kadar veya oda silinene kadar tutulur
    console.log(`[DISCONNECT] Player ${playerId} disconnected during active game in ${code}, keeping in room`);
  } else {
    // In lobby or game over - also just mark as disconnected
    // Don't remove immediately; give them a chance to reconnect
    disconnectPlayer(code, playerId);
    socket.to(code).emit('room:playerDisconnected', {
      playerId,
      playerName: getPlayerName(room, playerId),
    });

    // Set a timeout to fully remove if they don't reconnect
    // Grace period: 30 dakika (tarayıcı kapatılıp tekrar açılsa bile yeterli süre)
    const GRACE_PERIOD = 30 * 60 * 1000; // 30 dakika
    const playerIdCopy = playerId;
    const codeCopy = code;
    setTimeout(() => {
      const r = getRoom(codeCopy);
      if (!r) return;
      const p = r.players.find(pl => pl.id === playerIdCopy);
      if (p && !p.connected) {
        // Player didn't reconnect - remove them
        const result = leaveRoom(codeCopy, playerIdCopy);
        if (result && !result.deleted) {
          io.to(codeCopy).emit('room:playerLeft', {
            playerId: playerIdCopy,
            newHostId: result.newHostId,
            players: getPublicPlayers(result.room),
          });
        }
        console.log(`[CLEANUP] Removed disconnected player ${playerIdCopy} from ${codeCopy} (after ${GRACE_PERIOD/1000}s grace)`);
      }
    }, GRACE_PERIOD);
  }

  socket.leave(code);
  socketRooms.delete(socket.id);
  socketToPlayer.delete(socket.id);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🕵️ Spyhaz server running on port ${PORT}`);
});
