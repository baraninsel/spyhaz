import { getState, applySnapshot, saveSession, clearSession, loadSession } from './state.js';
import { showToast } from './components/toast.js';
import { newId, fetchWithDeadline } from './utils/platform.js';

export const backend = (import.meta.env.VITE_BACKEND_URL || window.location.origin).replace(/\/$/, '');
const httpBackend = import.meta.env.PROD ? window.location.origin : backend;
let socket = null, session = null, retryTimer = null, attempts = 0, heartbeat = null, pongTimer = null, welcomeTimer = null;
let stopped = false, replaced = false, status = 'idle';
let entryDraft = null;
let httpMode = false, httpGeneration = null, httpTimer = null, httpBusy = null, epoch = 0;
const pending = new Map();
const announce = (next, error = '') => { status = next; window.dispatchEvent(new CustomEvent('spyhaz:connection', { detail: { status: next, error } })); };
export const connectionStatus = () => status;
export const currentSession = () => session;
const stopTimers = () => { clearTimeout(retryTimer); clearTimeout(pongTimer); clearTimeout(welcomeTimer); clearTimeout(httpTimer); clearInterval(heartbeat); };
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
  retryTimer = setTimeout(() => httpMode ? pollHTTP() : open(), delay);
}
function acceptSnapshot(message) {
  const previous = getState().snapshot;
  if (previous?.instanceId === message.instanceId && previous.revision > message.revision) return;
  applySnapshot(message); saveSession(session); attempts = 0;
  announce('ready');
  window.dispatchEvent(new CustomEvent('spyhaz:snapshot', { detail: message }));
}
function fatal(message) {
  if (message.code === 'SESSION_REPLACED') { replaced = true; announce('replaced', message.error); }
  else {
    stopped = true;
    if (['INVALID_SESSION', 'ROOM_EXPIRED', 'MEMBERSHIP_ENDED'].includes(message.code)) {
      clearSession(session); session = null;
      window.dispatchEvent(new CustomEvent('spyhaz:sessionEnded', { detail: message.error }));
    }
    announce('ended', message.error);
  }
  stopTimers(); failPending(message.error);
}
async function httpRequest(action, data = {}, requestEpoch = epoch) {
  if (!session) throw new Error('Oturum bulunamadı.');
  const { response, body } = await fetchWithDeadline(new URL('/api/rooms/' + encodeURIComponent(session.code) + '/session', httpBackend), {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ playerId:session.playerId, token:session.token, action, generation:httpGeneration, ...data }),
  });
  if (requestEpoch !== epoch) throw new Error('Bağlantı yenilendi. Güncel ekranı kontrol et.');
  if (!response.ok) {
    if (body.code) fatal(body);
    throw new Error(body.error || 'Sunucu yanıtı alınamadı.');
  }
  return body;
}
async function pollHTTP() {
  if (!httpMode || stopped || replaced || !session || httpBusy === epoch) return;
  clearTimeout(httpTimer);
  if (!navigator.onLine) { announce('offline'); return; }
  const requestEpoch = epoch;
  httpBusy = requestEpoch;
  try {
    const result = await httpRequest(httpGeneration ? 'sync' : 'resume', {}, requestEpoch);
    httpGeneration = result.generation;
    if (result.snapshot) acceptSnapshot(result.snapshot);
  } catch (error) {
    if (requestEpoch === epoch && !stopped && !replaced) scheduleRetry();
  } finally {
    if (httpBusy === requestEpoch) httpBusy = null;
    if (requestEpoch === epoch && status === 'ready' && !document.hidden && !stopped && !replaced)
      httpTimer = setTimeout(pollHTTP, 5000);
  }
}
function startHTTP() {
  if (stopped || replaced || !session) return;
  const old = socket; socket = null; stopTimers();
  if (old) old.close();
  httpMode = true;
  announce('reconnecting', 'Yedek bağlantı kuruluyor. Odan ve oyuncu kimliğin korunuyor.');
  pollHTTP();
}
function open() {
  if (httpMode) { pollHTTP(); return; }
  if (stopped || replaced || !session || socket?.readyState === WebSocket.CONNECTING) return;
  stopTimers();
  const old = socket;
  socket = null;
  if (old) old.close(1000, 'replace-local');
  announce('connecting');
  const url = new URL('/api/rooms/' + encodeURIComponent(session.code) + '/socket', backend);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws;
  try { ws = new WebSocket(url); }
  catch { startHTTP(); return; }
  socket = ws;
  welcomeTimer = setTimeout(() => { if (socket === ws && status !== 'ready') startHTTP(); }, 3500);
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
      acceptSnapshot(message);
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
      fatal(message);
    } else if (message.type === 'error') showToast(message.error, 'error');
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    stopTimers();
    failPending('Bağlantı kesildi. Güncel ekran yüklendiğinde tekrar deneyebilirsin.');
    if (!stopped && !replaced) startHTTP();
  };
  ws.onerror = () => { if (socket === ws) ws.close(); };
}
export function connectSession(value, force = false) {
  if (!value) return;
  if (!force && session?.code === value.code && session?.playerId === value.playerId && status === 'ready') return;
  epoch++; httpMode = false; httpGeneration = null;
  session = { ...value, backend };
  saveSession(session);
  stopped = false; replaced = false; attempts = 0;
  open();
}
export function restoreSession(code) {
  const saved = loadSession(backend, code);
  if (!saved) return false;
  clearInvite();
  connectSession(saved);
  return true;
}
function clearInvite() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('code')) return;
  url.searchParams.delete('code');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
export function retryConnection() {
  if (session) connectSession(session, true);
}
export function endSession() {
  const old = socket;
  epoch++; httpMode = false; httpGeneration = null;
  stopped = true; replaced = false; stopTimers(); socket = null;
  clearSession(session); session = null;
  if (old) old.close(1000, 'leave');
  failPending('Odadan ayrıldın.');
  announce('idle');
}
export function sendCommand(type, payload = {}, commandId = newId()) {
  const snapshot = getState().snapshot;
  if (status !== 'ready' || (!httpMode && socket?.readyState !== WebSocket.OPEN) || !snapshot) return Promise.reject(new Error('Önce bağlantının geri gelmesini bekle.'));
  const data = { v: 2, id: commandId, type, contextId: snapshot.contextId, turnId: snapshot.game?.question.turnId || snapshot.hostControls?.turnId, ballotId: snapshot.game?.ballot?.id, payload };
  const requestEpoch = epoch;
  if (httpMode) return httpRequest(type === 'session:sync' ? 'sync' : 'command', { command:data }).catch(error => {
    if (requestEpoch === epoch && !stopped && !replaced) scheduleRetry();
    throw error;
  }).then(result => {
    if (result.snapshot) acceptSnapshot(result.snapshot);
    if (result.ack && !result.ack.ok) throw new Error(result.ack.error);
    return result.ack || { ok:true };
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(commandId); reject(new Error('Yanıt gecikti. Güncel ekranı kontrol ederek tekrar deneyebilirsin.')); }, 10_000);
    pending.set(commandId, { resolve, reject, timer });
    socket.send(JSON.stringify(data));
  });
}
// Compatibility for the retained local chat component.
export const getSocket = () => ({ emit(type, payload) { return sendCommand(type, payload).catch(error => showToast(error.message, 'error')); } });
export async function enterRoom(mode, name, code, settings = {}) {
  if (mode === 'join') {
    const saved = loadSession(backend, code);
    if (saved) { clearInvite(); connectSession(saved); return; }
  }
  const draftKey = 'spyhaz_pending_entry';
  let draft = entryDraft;
  if (draft && (draft.mode !== mode || draft.name !== name || (mode === 'join' && draft.code !== code))) draft = null;
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
    draft = { mode, name, backend, code: mode === 'create' ? letters.slice(0,3) + '-' + letters.slice(3) : code, playerId: newId(), token, settings };
    try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* in-memory identity still works */ }
  }
  entryDraft = draft;
  const path = mode === 'create' ? '/api/rooms' : '/api/rooms/' + encodeURIComponent(draft.code) + '/players';
  let response, result;
  try {
    ({ response, body: result } = await fetchWithDeadline(new URL(path, httpBackend), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }));
  } catch (error) {
    if (!navigator.onLine) throw new Error('İnternet bağlantın yok. Bağlantı geldikten sonra tekrar dene.');
    if (error.name === 'AbortError') throw new Error('Sunucu yanıtı gecikti. Aynı düğmeyle güvenle tekrar deneyebilirsin.');
    throw new Error('Oyun sunucusuna ulaşılamadı. Bağlantını kontrol edip tekrar dene.');
  }
  if (!response.ok) {
    if (response.status === 409 && mode === 'create') { entryDraft = null; try { sessionStorage.removeItem(draftKey); } catch {} }
    throw new Error(result.error || 'Odaya girilemedi.');
  }
  try { sessionStorage.removeItem(draftKey); } catch {}
  entryDraft = null;
  clearInvite();
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
