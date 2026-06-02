// Location Grid Component
export function renderLocationGrid(locations, options = {}) {
  const { selectable, selectedId, onSelect, previousLocationId } = options;

  const grid = document.createElement('div');
  grid.className = 'location-grid';

  locations.forEach(loc => {
    const card = document.createElement('div');
    const isPrevious = loc.id === previousLocationId;
    card.className = `location-card ${selectable && !isPrevious ? 'selectable' : ''} ${selectedId === loc.id ? 'selected' : ''}`;
    
    if (isPrevious) {
      card.classList.add('eliminated');
    }
    
    card.dataset.locationId = loc.id;
    card.innerHTML = `
      <span class="location-card-emoji">${loc.emoji}</span>
      <span class="location-card-name">${loc.name}</span>
    `;

    if (selectable && onSelect) {
      if (!isPrevious) {
        card.addEventListener('click', () => {
          // Remove previous selection
          grid.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          onSelect(loc.id);
        });
      } else {
        card.style.cursor = 'not-allowed';
        card.style.opacity = '0.5';
      }
    } else if (!selectable) {
      // Toggle strikethrough for elimination during normal gameplay
      if (!isPrevious) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          card.classList.toggle('eliminated');
        });
      } else {
        card.style.cursor = 'not-allowed';
      }
    }

    grid.appendChild(card);
  });

  return grid;
}
