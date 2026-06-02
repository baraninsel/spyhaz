// Global State Management
const SESSION_KEY = 'spyhaz_session';
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 saat - tarayıcı kapatılsa bile bu süre içinde reconnect olabilir

const state = {
  playerId: null,
  playerName: '',
  roomCode: null,
  isHost: false,
  settings: { duration: 480, spyGuessCount: 2, enabledLocationIds: Array.from({ length: 30 }, (_, i) => i + 1) },
  players: [],

  // Game state
  gameActive: false,
  role: null,
  isSpy: false,
  location: null,
  locations: [],
  spyGuessesLeft: 0,
  previousLocationId: null,

  // Question state
  currentAskerId: null,
  currentAskerName: '',
  availableTargets: [],
  questionRound: 1,
  askedTarget: null,

  // Timer
  timerRemaining: 0,
  timerPaused: false,

  // Vote
  votePhase: null, // 'REQUEST', 'VOTING', null
  voteRequesterId: null,
  voteRequesterName: '',
  votedPlayers: new Set(),
  selectedSuspect: null,

  // Chat
  chatMessages: [],
  chatCollapsed: false,
  unreadCount: 0,

  // Role visibility
  roleHidden: false,

  // Reconnect
  reconnectToken: null,

  // Kick Chat Integration
  kickUsername: '',
  kickChatVisible: true,
  kickChatViewerId: null, // Only this player sees the Kick chat (usually the host/streamer)

  // Scoring
  scores: {}, // cumulative scores { playerId: points }
  roundNumber: 0,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(updates) {
  Object.assign(state, updates);
  notifyListeners();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error('State listener error:', e); }
  }
}

export function resetGameState() {
  const currentState = getState();
  setState({
    gameActive: false,
    role: null,
    isSpy: false,
    location: null,
    locations: [],
    spyGuessesLeft: 0,
    currentAskerId: null,
    currentAskerName: '',
    availableTargets: [],
    questionRound: 1,
    askedTarget: null,
    timerRemaining: 0,
    timerPaused: false,
    votePhase: null,
    voteRequesterId: null,
    voteRequesterName: '',
    votedPlayers: new Set(),
    selectedSuspect: null,
    chatMessages: [],
    unreadCount: 0,
    roleHidden: false,
    // Keep kickUsername so it persists between games
    kickChatVisible: true,
    kickChatViewerId: null,
    previousLocationId: currentState.previousLocationId,
  });
}

// Helper: safe storage access (private browsing / quota exceeded fallback)
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    try { sessionStorage.setItem(key, value); } catch (_) { /* no storage available */ }
  }
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || null;
  } catch (e) {
    try { return sessionStorage.getItem(key) || null; } catch (_) { return null; }
  }
}

function safeRemoveItem(key) {
  try { localStorage.removeItem(key); } catch (_) {}
  try { sessionStorage.removeItem(key); } catch (_) {}
}

export function saveSession() {
  try {
    const { playerId, roomCode, playerName, reconnectToken, gameActive } = state;
    if (playerId && roomCode && playerName) {
      const sessionData = {
        playerId,
        roomCode,
        playerName,
        reconnectToken: reconnectToken || null,
        gameActive: !!gameActive,
        savedAt: Date.now(),
      };
      safeSetItem(SESSION_KEY, JSON.stringify(sessionData));
      console.log('[Session] Saved:', { playerId, roomCode, playerName, gameActive: !!gameActive });
    }
  } catch (e) {
    console.warn('[Session] Save failed:', e);
  }
}

export function loadSession() {
  try {
    const raw = safeGetItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);

    // TTL kontrolü - SESSION_TTL sonra geçersiz
    if (session.savedAt && (Date.now() - session.savedAt > SESSION_TTL)) {
      console.log('[Session] Expired, clearing.');
      clearSession();
      return null;
    }

    if (session.playerId && session.roomCode && session.playerName) {
      console.log('[Session] Loaded:', session);
      return session;
    }
    return null;
  } catch (e) {
    console.warn('[Session] Load failed:', e);
    return null;
  }
}

export function clearSession() {
  try {
    safeRemoveItem(SESSION_KEY);
    console.log('[Session] Cleared');
  } catch (e) {
    console.warn('[Session] Clear failed:', e);
  }
}
