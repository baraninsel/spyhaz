// Location Grid Component
export function renderLocationGrid(locations, options = {}) {
  const { selectable, selectedId, onSelect } = options;

  const grid = document.createElement('div');
  grid.className = 'location-grid';

  locations.forEach(loc => {
    const card = document.createElement('div');
    card.className = `location-card ${selectable ? 'selectable' : ''} ${selectedId === loc.id ? 'selected' : ''}`;
    card.dataset.locationId = loc.id;
    card.innerHTML = `
      <span class="location-card-emoji">${loc.emoji}</span>
      <span class="location-card-name">${loc.name}</span>
    `;

    if (selectable && onSelect) {
      card.addEventListener('click', () => {
        // Remove previous selection
        grid.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        onSelect(loc.id);
      });
    } else if (!selectable) {
      // Toggle strikethrough for elimination during normal gameplay
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        card.classList.toggle('eliminated');
      });
    }

    grid.appendChild(card);
  });

  return grid;
}
