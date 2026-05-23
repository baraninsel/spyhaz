// Spyhaz Server - Express + Socket.IO
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createRoom, joinRoom, leaveRoom, disconnectPlayer,
  getRoom, getPublicPlayers, deleteRoom
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

// Track which room each socket is in
const socketRooms = new Map(); // socketId -> roomCode

function getPlayerName(room, playerId) {
  return room.players.find(p => p.id === playerId)?.name || '?';
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── ROOM EVENTS ───────────────────────────────────────────────
  socket.on('room:create', ({ settings, playerName }, callback) => {
    const room = createRoom(socket.id, playerName, settings);
    socket.join(room.code);
    socketRooms.set(socket.id, room.code);

    callback?.({
      success: true,
      code: room.code,
      playerId: socket.id,
      settings: room.settings,
      players: getPublicPlayers(room),
    });
    console.log(`[ROOM] Created: ${room.code} by ${playerName}`);
  });

  socket.on('room:join', ({ code, playerName }, callback) => {
    const normalizedCode = code.toUpperCase().trim();
    const result = joinRoom(normalizedCode, socket.id, playerName);

    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    const room = result.room;
    socket.join(room.code);
    socketRooms.set(socket.id, room.code);

    // Notify others
    socket.to(room.code).emit('room:playerJoined', {
      player: { id: socket.id, name: playerName, connected: true, isHost: false },
    });

    callback?.({
      success: true,
      code: room.code,
      playerId: socket.id,
      settings: room.settings,
      players: getPublicPlayers(room),
      hostId: room.hostId,
    });
    console.log(`[ROOM] ${playerName} joined ${room.code}`);
  });

  socket.on('room:updateSettings', ({ settings }) => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.game && room.game.state !== 'LOBBY') return;

    // Update settings
    if (settings.duration) room.settings.duration = settings.duration;
    if (settings.spyGuessCount) room.settings.spyGuessCount = settings.spyGuessCount;

    // Broadcast to all players
    socket.to(code).emit('room:settingsUpdated', { settings: room.settings });
  });

  socket.on('room:leave', () => {
    handleLeave(socket);
  });

  // ── GAME EVENTS ───────────────────────────────────────────────
  socket.on('game:start', (_, callback) => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return callback?.({ error: 'Oda bulunamadı.' });
    if (room.hostId !== socket.id) return callback?.({ error: 'Sadece oda sahibi oyunu başlatabilir.' });
    if (room.players.length < 3) return callback?.({ error: 'En az 3 oyuncu gerekli.' });

    const result = startGame(room);
    if (result.error) return callback?.({ error: result.error });

    // Send each player their own role data
    for (const player of room.players) {
      const gameData = getPlayerGameData(room, player.id);
      io.to(player.id).emit('game:started', {
        ...gameData,
        players: getPublicPlayers(room),
      });
    }

    callback?.({ success: true });
    console.log(`[GAME] Started in ${code}, spy: ${room.game.spyId}`);
  });

  socket.on('game:ready', () => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game) return;

    const allReady = markReady(room, socket.id);
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
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;

    const qs = room.game.questionState;
    if (qs.currentAskerId !== socket.id) {
      return callback?.({ error: 'Sıra sizde değil.' });
    }

    const result = selectTarget(qs, targetId);
    if (result.error) return callback?.({ error: result.error });

    io.to(code).emit('question:asked', {
      askerId: socket.id,
      askerName: getPlayerName(room, socket.id),
      targetId,
      targetName: getPlayerName(room, targetId),
    });

    callback?.({ success: true });
  });

  socket.on('question:done', () => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;

    const qs = room.game.questionState;
    // Only the asker can complete the turn
    if (qs.currentAskerId !== socket.id) return;

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
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;
    if (room.game.voteState) return; // vote already in progress

    room.game.state = 'VOTE_REQUEST';
    room.game.voteState = createVoteRequest(socket.id);

    // Pause timer during voting
    pauseTimer(room);
    io.to(code).emit('timer:update', {
      remaining: room.game.timer.remaining,
      isPaused: true,
    });

    io.to(code).emit('vote:requested', {
      requesterId: socket.id,
      requesterName: getPlayerName(room, socket.id),
    });
  });

  socket.on('vote:respond', ({ accept }) => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game?.voteState || room.game.voteState.phase !== 'REQUEST') return;

    respondToRequest(room.game.voteState, socket.id, accept);

    const result = checkRequestResult(room.game.voteState, room.players.length);
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
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game?.voteState || room.game.voteState.phase !== 'VOTING') return;

    castVote(room.game.voteState, socket.id, suspectId);

    // Notify others that this player voted (without revealing who)
    io.to(code).emit('vote:playerVoted', { playerId: socket.id });

    const result = checkVoteResult(room.game.voteState, room.players.length);
    if (!result.complete) return;

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
        endGame(room, io, code, 'PLAYERS', 'Casus doğru tahmin edildi!');
      } else {
        endGame(room, io, code, 'SPY', 'Yanlış kişi suçlandı! Casus kazandı.');
      }
    }, 3000);
  });

  // ── SPY GUESS ─────────────────────────────────────────────────
  socket.on('spy:guess', ({ locationId }, callback) => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game || room.game.state !== 'PLAYING') return;

    const result = handleSpyGuess(room, socket.id, locationId);
    if (result.error) return callback?.({ error: result.error });

    io.to(code).emit('spy:guessResult', {
      correct: result.correct,
      guessedLocationName: result.guessedLocationName,
      spyId: socket.id,
      spyName: getPlayerName(room, socket.id),
      guessesLeft: result.guessesLeft,
    });

    if (result.correct) {
      setTimeout(() => {
        endGame(room, io, code, 'SPY', 'Casus konumu doğru tahmin etti!');
      }, 2000);
    } else if (result.guessesLeft <= 0) {
      setTimeout(() => {
        endGame(room, io, code, 'PLAYERS', 'Casus tahmin hakkını tüketti!');
      }, 2000);
    }

    callback?.({ success: true, ...result });
  });

  // ── TIMER ─────────────────────────────────────────────────────
  socket.on('timer:pause', () => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game) return;
    if (room.hostId !== socket.id) return;

    pauseTimer(room);
    io.to(code).emit('timer:update', {
      remaining: room.game.timer.remaining,
      isPaused: true,
    });
  });

  socket.on('timer:resume', () => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room?.game) return;
    if (room.hostId !== socket.id) return;

    resumeTimer(room);
    io.to(code).emit('timer:update', {
      remaining: room.game.timer.remaining,
      isPaused: false,
    });
  });

  // ── CHAT ──────────────────────────────────────────────────────
  socket.on('chat:send', ({ message }) => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return;
    if (!message || message.trim().length === 0) return;

    const chatMsg = {
      senderId: socket.id,
      senderName: getPlayerName(room, socket.id),
      message: message.trim().slice(0, 300), // max 300 chars
      time: Date.now(),
    };

    room.chat.push(chatMsg);
    // Keep last 100 messages
    if (room.chat.length > 100) room.chat.shift();

    io.to(code).emit('chat:message', chatMsg);
  });

  // ── RETURN TO LOBBY ───────────────────────────────────────────
  socket.on('game:returnToLobby', () => {
    const code = socketRooms.get(socket.id);
    const room = getRoom(code);
    if (!room) return;
    if (room.hostId !== socket.id) return;

    resetGame(room);
    io.to(code).emit('game:returnedToLobby', {
      players: getPublicPlayers(room),
      settings: room.settings,
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
  if (!code) return;

  const room = getRoom(code);
  if (!room) {
    socketRooms.delete(socket.id);
    return;
  }

  // If game is active, mark as disconnected but don't remove
  if (room.game && room.game.state !== 'GAME_OVER' && room.game.state !== 'LOBBY') {
    disconnectPlayer(code, socket.id);
    socket.to(code).emit('room:playerDisconnected', {
      playerId: socket.id,
      playerName: getPlayerName(room, socket.id),
    });
  } else {
    const result = leaveRoom(code, socket.id);
    if (result && !result.deleted) {
      socket.to(code).emit('room:playerLeft', {
        playerId: socket.id,
        newHostId: result.newHostId,
        players: getPublicPlayers(result.room),
      });
    }
  }

  socket.leave(code);
  socketRooms.delete(socket.id);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🕵️ Spyhaz server running on port ${PORT}`);
});
