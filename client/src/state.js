const KEY = 'spyhaz_sessions_v2';
const state = { snapshot: null, players: [], roomCode: null, playerId: null, chatMessages: [], chatCollapsed: false, unreadCount: 0, kickUsername: '', kickChatVisible: false, kickChatViewerId: null };
export const getState = () => state;
export const setState = updates => Object.assign(state, updates);
export function readStorage(key, fallback = null) {
  try { return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? fallback; }
  catch { try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; } }
}
export function writeStorage(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch { try { sessionStorage.setItem(key, value); return true; } catch { return false; } }
}
function sessions() {
  try { const list = JSON.parse(readStorage(KEY, '[]')); return Array.isArray(list) ? list.filter(s => s && typeof s === 'object' && typeof s.backend === 'string' && typeof s.code === 'string' && typeof s.savedAt === 'number') : []; } catch { return []; }
}
export function saveSession(session) {
  if (!session) return;
  const saved = { ...session, savedAt: Date.now() };
  const list = sessions().filter(s => !(s.code === saved.code && s.backend === saved.backend));
  return writeStorage(KEY, JSON.stringify([saved, ...list].slice(0, 10)));
}
export function loadSession(backend) {
  return sessions().find(s => s.backend === backend && s.token && s.playerId && s.code && Date.now() - s.savedAt < 86_400_000) || null;
}
export function clearSession(session) {
  if (!session) return;
  writeStorage(KEY, JSON.stringify(sessions().filter(s => !(s.code === session.code && s.backend === session.backend))));
}
export function applySnapshot(data) {
  setState({ snapshot: data, players: data.players, roomCode: data.code, playerId: data.playerId, chatMessages: data.chat,
    isHost: data.hostId === data.playerId, settings: data.settings, gameActive: !!data.game, role: data.game?.profession || null,
    isSpy: data.game?.isSpy || false, location: data.game?.location || null });
}
