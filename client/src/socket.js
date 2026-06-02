// Socket.IO Client Connection — URL-Based Reconnect
import { io } from 'socket.io-client';
import { getState, setState, loadSession, saveSession, clearSession } from './state.js';
import { showToast } from './components/toast.js';

let socket = null;
let heartbeatInterval = null;
let isReconnecting = false;

// Heartbeat: session TTL'i canlı tut (bağlıyken)
function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    const session = loadSession();
    if (session && getState().roomCode) {
      saveSession();
    }
  }, 60 * 1000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function initSocket() {
  if (socket) return socket;

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:3000' 
      : 'https://spyhaz.onrender.com');

  socket = io(backendUrl, {
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.3,
    timeout: 15000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    startHeartbeat();
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    if (reason !== 'io client disconnect') {
      showToast('Bağlantı koptu... Yeniden bağlanılıyor.', 'warning');
    }
    stopHeartbeat();
  });

  socket.on('reconnect', () => {
    console.log('[Socket] Reconnected (Socket.IO level)');
    showToast('Yeniden bağlandı!', 'success');
    // Sadece kullanıcı hâlâ bir odadaysa tekrar bağlan
    if (getState().roomCode) {
      attemptSessionReconnect();
    }
    startHeartbeat();
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  // ── Page Lifecycle Events ─────────────────────────────────────
  window.addEventListener('beforeunload', () => saveSession());
  window.addEventListener('pagehide', () => saveSession());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (socket && !socket.connected) {
        socket.connect();
      } else if (socket && socket.connected && getState().roomCode) {
        attemptSessionReconnect();
      }
    } else {
      saveSession();
    }
  });

  document.addEventListener('freeze', () => saveSession());

  return socket;
}

// Reconnect — dışarıdan çağrılabilir (main.js URL kontrolünden)
export function attemptSessionReconnect() {
  const session = loadSession();
  if (!session) {
    window.dispatchEvent(new CustomEvent('spyhaz:reconnectFailed'));
    return;
  }
  if (isReconnecting) return;

  isReconnecting = true;
  console.log('[Socket] Attempting session reconnect:', session);
  window.dispatchEvent(new CustomEvent('spyhaz:reconnecting', { detail: session }));

  socket.emit('room:reconnect', {
    playerId: session.playerId,
    roomCode: session.roomCode,
    playerName: session.playerName,
    reconnectToken: session.reconnectToken || null,
  }, (response) => {
    isReconnecting = false;

    if (response?.success) {
      console.log('[Socket] Session reconnect successful:', response.screen);
      if (response.reconnectToken) {
        setState({ reconnectToken: response.reconnectToken });
      }
      window.dispatchEvent(new CustomEvent('spyhaz:reconnected', { detail: response }));
    } else {
      console.log('[Socket] Session reconnect failed:', response?.error);
      clearSession();
      stopHeartbeat();
      window.dispatchEvent(new CustomEvent('spyhaz:reconnectFailed'));
    }
  });
}

export function getSocket() {
  return socket;
}

export function stopSessionHeartbeat() {
  stopHeartbeat();
}

export function emitWithCallback(event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data, (response) => {
      resolve(response);
    });
  });
}
