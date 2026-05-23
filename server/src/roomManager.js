// Room Manager - handles room creation, joining, leaving
import { randomBytes } from 'node:crypto';

const rooms = new Map();

// Generate a unique 6-char room code (format: XXX-XXX)
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code;
  do {
    code = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length];
    }
    code = code.slice(0, 3) + '-' + code.slice(3);
  } while (rooms.has(code));
  return code;
}

export function createRoom(hostId, hostName, settings = {}) {
  const code = generateCode();
  const room = {
    code,
    hostId,
    settings: {
      duration: settings.duration || 480, // seconds (8 min default)
      spyGuessCount: settings.spyGuessCount || 2,
    },
    players: [
      { id: hostId, name: hostName, connected: true }
    ],
    game: null, // game state set when game starts
    chat: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Oda bulunamadı.' };
  if (room.game && room.game.state !== 'LOBBY') return { error: 'Oyun zaten başlamış.' };
  if (room.players.length >= 8) return { error: 'Oda dolu (maks. 8 kişi).' };
  if (room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    return { error: 'Bu isim zaten kullanılıyor.' };
  }

  // Check if player is reconnecting
  const existing = room.players.find(p => p.id === playerId);
  if (existing) {
    existing.connected = true;
    existing.name = playerName;
  } else {
    room.players.push({ id: playerId, name: playerName, connected: true });
  }
  room.lastActivity = Date.now();
  return { room };
}

export function leaveRoom(code, playerId) {
  const room = rooms.get(code);
  if (!room) return null;

  room.players = room.players.filter(p => p.id !== playerId);
  room.lastActivity = Date.now();

  // If room is empty, delete it
  if (room.players.length === 0) {
    rooms.delete(code);
    return { deleted: true };
  }

  // If host left, transfer to next player
  let newHostId = null;
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
    newHostId = room.hostId;
  }

  return { room, newHostId };
}

export function disconnectPlayer(code, playerId) {
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.connected = false;
  return room;
}

export function getRoom(code) {
  return rooms.get(code) || null;
}

export function deleteRoom(code) {
  rooms.delete(code);
}

export function getPublicPlayers(room) {
  return room.players.map(p => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    isHost: p.id === room.hostId,
  }));
}

// Cleanup inactive rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 30 * 60 * 1000) { // 30 min
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);
