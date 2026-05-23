// Socket.IO Client Connection
import { io } from 'socket.io-client';
import { getState, setState } from './state.js';
import { showToast } from './components/toast.js';

let socket = null;

export function initSocket() {
  if (socket) return socket;

  // If we are on Vercel, we need to connect to the Render backend.
  // Otherwise, fallback to the same origin (local or single-server deployment).
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:3000' 
      : 'https://spyhaz.onrender.com');

  socket = io(backendUrl, {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    setState({ playerId: socket.id });
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    showToast('Bağlantı koptu...', 'warning');
  });

  socket.on('reconnect', () => {
    console.log('[Socket] Reconnected');
    showToast('Yeniden bağlandı!', 'success');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function emitWithCallback(event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data, (response) => {
      resolve(response);
    });
  });
}
