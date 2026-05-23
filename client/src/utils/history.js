// Game History - localStorage
const HISTORY_KEY = 'spyhaz_history';
const MAX_HISTORY = 50;

export function saveGameToHistory(data) {
  const history = getHistory();
  history.unshift({
    date: new Date().toISOString(),
    location: data.location,
    role: data.role,
    isSpy: data.isSpy,
    winner: data.winner,
    reason: data.reason,
    playerCount: data.playerCount,
  });
  // Keep only last 50
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function getStats() {
  const history = getHistory();
  if (history.length === 0) return null;

  const totalGames = history.length;
  const spyGames = history.filter(g => g.isSpy).length;
  const wins = history.filter(g =>
    (g.isSpy && g.winner === 'SPY') || (!g.isSpy && g.winner === 'PLAYERS')
  ).length;

  return {
    totalGames,
    spyGames,
    wins,
    winRate: Math.round((wins / totalGames) * 100),
  };
}
