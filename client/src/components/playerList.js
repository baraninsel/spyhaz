// Player List Component - All players same color, no emojis

// Uniform color for all avatars (no per-player colors to avoid spy hints)
export function getAvatarColor() {
  return 'var(--accent-cyan)';
}

export function getInitials(name) {
  return name.slice(0, 2).toUpperCase();
}

export function renderPlayerList(players, options = {}) {
  const { showStatus, compact } = options;

  return players.map(p => {
    const isConnected = p.connected !== false;

    return `
      <div class="player-item ${compact ? 'player-list-compact' : ''}" data-player-id="${p.id}">
        <div class="player-item-top">
          <div class="player-avatar">${getInitials(p.name)}</div>
          <span class="player-name">${p.name}</span>
          ${p.isHost ? '<span class="player-host-badge">HOST</span>' : ''}
        </div>
        ${showStatus ? `
        <div class="player-item-bottom">
          <div class="player-status-wrap">
            <div class="player-status-dot ${isConnected ? 'online' : 'offline'}"></div>
            <span class="player-status-text">${isConnected ? 'Bağlı' : 'Koptu'}</span>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');
}
