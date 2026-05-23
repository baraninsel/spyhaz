// Role Card Component (placeholder file for role card utilities)
export function renderRoleCard(isSpy, location, role) {
  if (isSpy) {
    return `
      <div class="card role-card role-card-spy">
        <div class="role-card-emoji">🕵️</div>
        <div class="role-card-spy-label">SEN CASUSSUN!</div>
        <div class="role-card-role" style="color: var(--text-secondary); font-size: var(--fs-sm); margin-top: var(--sp-2);">
          Konumu bulmaya çalış...
        </div>
      </div>
    `;
  }
  return `
    <div class="card role-card card-glow">
      <div class="role-card-emoji">${location.emoji}</div>
      <div class="role-card-location">${location.name}</div>
      <div class="role-card-role">${role}</div>
    </div>
  `;
}
