// Player avatar color generator from name
const AVATAR_COLORS = [
  '#00e5ff', '#7c4dff', '#ff1744', '#00e676', '#ffd600',
  '#ff6d00', '#d500f9', '#00b0ff', '#76ff03', '#ff3d00',
];

export function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name) {
  return name.charAt(0).toUpperCase();
}

export function renderPlayerList(players, options = {}) {
  const { showStatus, askerId, targetId, compact } = options;

  return players.map(p => {
    const color = getAvatarColor(p.name);
    const isAsking = p.id === askerId;
    const isTarget = p.id === targetId;
    let statusClass = p.connected !== false ? 'online' : 'offline';
    let statusText = p.connected !== false ? 'Bağlı' : 'Koptu';
    if (isAsking) { statusClass = 'asking'; statusText = 'Soruyor'; }
    if (isTarget) { statusClass = 'answering'; statusText = 'Cevaplıyor'; }

    return `
      <div class="player-item ${compact ? 'player-list-compact' : ''}" data-player-id="${p.id}">
        <div class="player-item-top">
          <div class="player-avatar" style="background: ${color}">${getInitials(p.name)}</div>
          <span class="player-name">${p.name}</span>
          ${p.isHost ? '<span class="player-host-badge">HOST</span>' : ''}
        </div>
        ${showStatus || isAsking || isTarget ? `
        <div class="player-item-bottom">
          ${showStatus ? `
            <div class="player-status-wrap">
              <div class="player-status-dot ${statusClass}"></div>
              <span class="player-status-text">${statusText}</span>
            </div>
          ` : ''}
          <div class="player-badges">
            ${isAsking ? '<span class="badge badge-cyan">Soru Sırası</span>' : ''}
            ${isTarget ? '<span class="badge badge-purple">Hedef</span>' : ''}
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');
}
