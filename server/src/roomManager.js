// Room Manager - handles room creation, joining, leaving, reconnecting
import { randomBytes, randomUUID } from 'node:crypto';

const rooms = new Map();

const AVATARS = ['🕶️', '🕵️', '👩‍💻', '🤖', '👽', '👻', '🦊', '🐱', '🎭', '👾', '🚀', '🎯'];
function getRandomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

// Input sanitization — strip HTML/script chars
function sanitizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/[<>"'&\/\\]/g, '').trim().slice(0, 20);
}

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

// Generate a unique player ID (UUID)
function generatePlayerId() {
  return randomUUID();
}

export function createRoom(socketId, rawHostName, settings = {}) {
  const hostName = sanitizeName(rawHostName);
  if (!hostName || hostName.length < 2) return { error: 'İsim en az 2 karakter olmalı.' };
  const code = generateCode();
  const playerId = generatePlayerId();
  const reconnectToken = randomUUID();
  const room = {
    code,
    hostId: playerId,
    settings: {
      duration: settings.duration || 480, // seconds (8 min default)
      spyGuessCount: settings.spyGuessCount || 2,
      enabledLocationIds: settings.enabledLocationIds || Array.from({ length: 30 }, (_, i) => i + 1),
    },
    players: [
      { id: playerId, socketId, name: hostName, connected: true, avatar: getRandomAvatar(), reconnectToken }
    ],
    game: null, // game state set when game starts
    previousLocationId: null, // stores location from previous game
    scores: {}, // cumulative scores across rounds { playerId: points }
    roundNumber: 0, // track round number
    chat: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(code, room);
  return { room, playerId, reconnectToken };
}

export function joinRoom(code, socketId, rawPlayerName) {
  const playerName = sanitizeName(rawPlayerName);
  if (!playerName || playerName.length < 2) return { error: 'İsim en az 2 karakter olmalı.' };

  const room = rooms.get(code);
  if (!room) return { error: 'Oda bulunamadı.' };
  if (room.game && room.game.state !== 'LOBBY') return { error: 'Oyun zaten başlamış.' };
  if (room.players.length >= 8) return { error: 'Oda dolu (maks. 8 kişi).' };
  if (room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    return { error: 'Bu isim zaten kullanılıyor.' };
  }

  const playerId = generatePlayerId();
  const reconnectToken = randomUUID();
  room.players.push({ id: playerId, socketId, name: playerName, connected: true, avatar: getRandomAvatar(), reconnectToken });
  room.lastActivity = Date.now();
  return { room, playerId, reconnectToken };
}

// Reconnect a player who refreshed the page or lost connection (or browser close/reopen)
export function reconnectPlayer(code, playerId, newSocketId, token = null) {
  const room = rooms.get(code);
  if (!room) return { error: 'Oda bulunamadı.' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: 'Oyuncu bu odada bulunamadı.' };

  // Token doğrulama — zorunlu, bypass edilemez
  if (!token || !player.reconnectToken || token !== player.reconnectToken) {
    return { error: 'Geçersiz reconnect token.' };
  }

  // Update socket ID and mark as connected
  player.socketId = newSocketId;
  player.connected = true;
  room.lastActivity = Date.now();

  // Token rotation — her başarılı reconnect'te yeni token üret (güvenlik)
  const newToken = randomUUID();
  player.reconnectToken = newToken;

  return { room, player, reconnectToken: newToken };
}

// Find room by player ID (search all rooms)
export function findRoomByPlayerId(playerId) {
  for (const [code, room] of rooms) {
    const player = room.players.find(p => p.id === playerId);
    if (player) return { code, room, player };
  }
  return null;
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

// Get player by socket ID
export function getPlayerBySocketId(room, socketId) {
  return room.players.find(p => p.socketId === socketId) || null;
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
    avatar: p.avatar || '👤',
    connected: p.connected,
    isHost: p.id === room.hostId,
  }));
}

// Cleanup inactive rooms every 15 minutes
// Room 2 saat inaktif kalırsa silinir (tarayıcı kapatıp tekrar açma süresi)
setInterval(() => {
  const now = Date.now();
  const ROOM_TTL = 2 * 60 * 60 * 1000; // 2 saat
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL) {
      console.log(`[CLEANUP] Room ${code} inactive for ${ROOM_TTL/60000}min, deleting.`);
      rooms.delete(code);
    }
  }
}, 15 * 60 * 1000);
