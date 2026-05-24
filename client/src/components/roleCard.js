// Role Card Component with hide/show toggle
import { getState, setState } from '../state.js';

export function renderRoleCard(isSpy, location, role) {
  const state = getState();
  const hidden = state.roleHidden;

  if (isSpy) {
    return `
      <div class="card role-card role-card-spy">
        <div class="role-card-header-row">
          <button class="role-hide-btn" id="btn-role-toggle" title="${hidden ? 'Rolü Göster' : 'Rolü Gizle'}">
            ${hidden ? '👁️' : '🙈'}
          </button>
        </div>
        ${hidden ? `
          <div class="role-card-hidden">
            <div class="role-card-hidden-icon">🔒</div>
            <div class="role-card-hidden-text">Rol Gizli</div>
          </div>
        ` : `
          <div class="role-card-spy-label">SEN CASUSSUN!</div>
          <div class="role-card-role" style="color: var(--text-secondary); font-size: var(--fs-sm); margin-top: var(--sp-2);">
            Konumu bulmaya çalış...
          </div>
        `}
      </div>
    `;
  }
  return `
    <div class="card role-card card-glow">
      <div class="role-card-header-row">
        <button class="role-hide-btn" id="btn-role-toggle" title="${hidden ? 'Rolü Göster' : 'Rolü Gizle'}">
          ${hidden ? '👁️' : '🙈'}
        </button>
      </div>
      ${hidden ? `
        <div class="role-card-hidden">
          <div class="role-card-hidden-icon">🔒</div>
          <div class="role-card-hidden-text">Rol Gizli</div>
        </div>
      ` : `
        <div class="role-card-location">${location.name}</div>
        <div class="role-card-role">${role}</div>
      `}
    </div>
  `;
}
