import { escapeHtml } from '../utils/dom.js';
export const getAvatarColor = () => 'var(--accent-cyan)';
export const getInitials = name => String(name).slice(0, 2).toLocaleUpperCase('tr');
export function renderPlayerList(players) {
  return players.map(p => `<div class="player-item"><div class="player-item-top"><div class="player-avatar">${escapeHtml(getInitials(p.name))}</div><span class="player-name">${escapeHtml(p.name)}</span>${p.isHost ? '<span class="player-host-badge">KURUCU</span>' : ''}</div><div class="player-status-wrap"><span class="player-status-dot ${p.connected ? 'online' : 'offline'}"></span><span class="player-status-text">${p.connected ? 'Bağlı' : 'Geri dönebilir'}</span></div></div>`).join('');
}
