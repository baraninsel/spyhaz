import { readStorage, writeStorage } from '../state.js';
const KEY = 'spyhaz_history';
export function getHistory() { try { const value = JSON.parse(readStorage(KEY, '[]')); return Array.isArray(value) ? value.filter(g => g && typeof g === 'object' && ['SPY', 'PLAYERS'].includes(g.winner)) : []; } catch { return []; } }
export function saveGameToHistory(data) {
  const history = getHistory();
  if (data.id && history.some(g => g.id === data.id)) return;
  history.unshift({ ...data, date: new Date().toISOString() });
  writeStorage(KEY, JSON.stringify(history.slice(0, 50)));
}
export function clearHistory() { writeStorage(KEY, '[]'); }
export function getStats() {
  const history = getHistory();
  if (!history.length) return null;
  const wins = history.filter(g => g.isSpy ? g.winner === 'SPY' : g.winner === 'PLAYERS').length;
  return { totalGames: history.length, wins, winRate: Math.round(wins / history.length * 100) };
}
