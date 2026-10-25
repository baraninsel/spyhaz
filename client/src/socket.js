import { getState, applySnapshot, saveSession, clearSession, loadSession } from './state.js';
import { showToast } from './components/toast.js';

export const backend = (import.meta.env.VITE_BACKEND_URL || window.location.origin).replace(/\/$/, '');
let socket = null, session = null, retryTimer = null, attempts = 0, heartbeat = null, pongTimer = null, welcomeTimer = null;
let stopped = false, replaced = false, status = 'idle';
const pending = new Map();
const announce = (next, error = '') => { status = next; window.dispatchEvent(new CustomEvent('spyhaz:connection', { detail: { status: next, error } })); };
export const connectionStatus = () => status;
export const currentSession = () => session;
const stopTimers = () => { clearTimeout(retryTimer); clearTimeout(pongTimer); clearTimeout(welcomeTimer); clearInterval(heartbeat); };
function failPending(message) {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(message)); }
  pending.clear();
}
function scheduleRetry() {
  if (stopped || replaced || !session) return;
  clearTimeout(retryTimer);
  if (!navigator.onLine) { announce('offline', 'İnternet bağlantısı bekleniyor. Odan korunuyor.'); return; }
  announce('reconnecting', 'Bağlantı yenileniyor. Odan ve oyuncu kimliğin korunuyor.');
  const delay = Math.min(10_000, 1000 * 1.6 ** attempts++) * (0.8 + Math.random() * 0.4);
  retryTimer = setTimeout(() => open(), delay);
}
function open() {
  if (stopped || replaced || !session || socket?.readyState === WebSocket.CONNECTING) return;
  stopTimers();
  const old = socket;
  socket = null;
  if (old) old.close(1000, 'replace-local');
  announce('connecting');
  const url = new URL('/api/rooms/' + encodeURIComponent(session.code) + '/socket', backend);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(url);
  socket = ws;
  welcomeTimer = setTimeout(() => { if (socket === ws && status !== 'ready') ws.close(); }, 15_000);
  ws.onopen = () => {
    if (socket !== ws) return;
    ws.send(JSON.stringify({ v: 2, type: 'session:resume', playerId: session.playerId, token: session.token }));
  };
  ws.onmessage = event => {
    if (socket !== ws) return;
    if (event.data === 'pong') { clearTimeout(pongTimer); return; }
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'snapshot') {
      const first = status !== 'ready';
      clearTimeout(welcomeTimer);
      attempts = 0;
      applySnapshot(message);
      saveSession(session);
      announce('ready');
      window.dispatchEvent(new CustomEvent('spyhaz:snapshot', { detail: message }));
      if (first) {
        clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN || document.hidden) return;
          ws.send('ping');
          clearTimeout(pongTimer);
          pongTimer = setTimeout(() => ws.close(), 12_000);
        }, 25_000);
        ws.send('ping');
      }
    } else if (message.type === 'ack') {
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer); pending.delete(message.id);
      if (message.ok) item.resolve(message); else item.reject(new Error(message.error || 'İşlem reddedildi.'));
    } else if (message.type === 'fatal') {
      if (message.code === 'SESSION_REPLACED') {
        replaced = true; announce('replaced', message.error);
      } else {
        stopped = true;
        if (['INVALID_SESSION', 'ROOM_EXPIRED', 'MEMBERSHIP_ENDED'].includes(message.code)) {
          clearSession(session); session = null;
          window.dispatchEvent(new CustomEvent('spyhaz:sessionEnded', { detail: message.error }));
        }
        announce('ended', message.error);
      }
      stopTimers(); failPending(message.error);
    } else if (message.type === 'error') showToast(message.error, 'error');
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    stopTimers();
    failPending('Bağlantı kesildi. Güncel ekran yüklendiğinde tekrar deneyebilirsin.');
    scheduleRetry();
  };
  ws.onerror = () => { if (socket === ws) ws.close(); };
}
export function connectSession(value, force = false) {
  if (!value) return;
  if (!force && session?.code === value.code && status === 'ready') return;
  session = { ...value, backend };
  saveSession(session);
  stopped = false; replaced = false; attempts = 0;
  open();
}
export function restoreSession() {
  const saved = loadSession(backend);
  if (saved) connectSession(saved);
}
export function retryConnection() {
  if (session) connectSession(session, true);
}
export function endSession() {
  const old = socket;
  stopped = true; replaced = false; stopTimers(); socket = null;
  clearSession(session); session = null;
  if (old) old.close(1000, 'leave');
  failPending('Odadan ayrıldın.');
  announce('idle');
}
export function sendCommand(type, payload = {}, commandId = crypto.randomUUID()) {
  const snapshot = getState().snapshot;
  if (status !== 'ready' || socket?.readyState !== WebSocket.OPEN || !snapshot) return Promise.reject(new Error('Önce bağlantının geri gelmesini bekle.'));
  const data = { v: 2, id: commandId, type, contextId: snapshot.contextId, turnId: snapshot.game?.question.turnId || snapshot.hostControls?.turnId, payload };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(commandId); reject(new Error('Yanıt gecikti. Güncel ekranı kontrol ederek tekrar deneyebilirsin.')); }, 10_000);
    pending.set(commandId, { resolve, reject, timer });
    socket.send(JSON.stringify(data));
  });
}
// Compatibility for the retained local chat component.
export const getSocket = () => ({ emit(type, payload) { return sendCommand(type, payload).catch(error => showToast(error.message, 'error')); } });
export async function enterRoom(mode, name, code, settings = {}) {
  const draftKey = 'spyhaz_pending_entry';
  let draft;
  try {
    const raw = sessionStorage.getItem(draftKey);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.mode === mode && saved.name === name && saved.backend === backend && (mode === 'create' || saved.code === code)) draft = saved;
  } catch { /* storage can be unavailable */ }
  if (!draft) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('');
    draft = { mode, name, backend, code: mode === 'create' ? letters.slice(0,3) + '-' + letters.slice(3) : code, playerId: crypto.randomUUID(), token, settings };
    try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* in-memory identity still works */ }
  }
  const path = mode === 'create' ? '/api/rooms' : '/api/rooms/' + encodeURIComponent(draft.code) + '/players';
  const response = await fetch(new URL(path, backend), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft), signal: AbortSignal.timeout(20_000) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 409 && mode === 'create') { try { sessionStorage.removeItem(draftKey); } catch {} }
    throw new Error(result.error || 'Odaya girilemedi.');
  }
  try { sessionStorage.removeItem(draftKey); } catch {}
  connectSession({ ...result, name, backend });
}
window.addEventListener('online', () => { if (!stopped && !replaced && session) open(); });
window.addEventListener('offline', () => announce('offline', 'İnternet kesildi. Geri geldiğinde aynı oyuncuyla devam edeceksin.'));
window.addEventListener('pageshow', () => { if (!stopped && !replaced && session && !socket) open(); });
document.addEventListener('visibilitychange', () => {
  if (!session) return;
  saveSession(session);
  if (!document.hidden && !stopped && !replaced) {
    if (!socket || socket.readyState !== WebSocket.OPEN) open();
    else sendCommand('session:sync').catch(() => { if (socket) socket.close(); });
  }
});
