// Global State Management
const state = {
  playerId: null,
  playerName: '',
  roomCode: null,
  isHost: false,
  settings: { duration: 480, spyGuessCount: 2 },
  players: [],

  // Game state
  gameActive: false,
  role: null,
  isSpy: false,
  location: null,
  locations: [],
  spyGuessesLeft: 0,

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
  });
}
