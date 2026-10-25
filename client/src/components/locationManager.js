// Location Manager Component - Modal for enabling/disabling game locations
import { showModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

import { locations as ALL_LOCATIONS } from '../../../shared/locations.js';
import { MIN_LOCATIONS } from '../../../shared/rules.js';

/**
 * Open the location manager modal
 * @param {number[]} currentEnabledIds - Currently enabled location IDs
 * @param {function} onSave - Callback with updated enabledLocationIds
 */
export function openLocationManager(currentEnabledIds, onSave) {
  // Clone to avoid mutations
  let enabledIds = new Set(currentEnabledIds);

  const contentHTML = `
    <div class="loc-manager">
      <div class="loc-manager-toolbar">
        <div class="loc-manager-search-wrap">
          <input type="text" class="input loc-manager-search" id="loc-search" placeholder="🔍 Konum ara..." autocomplete="off" />
        </div>
        <div class="loc-manager-actions">
          <button class="btn btn-sm btn-ghost" id="loc-select-all">Tümünü Seç</button>
          <button class="btn btn-sm btn-ghost" id="loc-deselect-all">Tümünü Kaldır</button>
        </div>
      </div>
      <div class="loc-manager-counter" id="loc-counter">
        <span class="loc-counter-num" id="loc-counter-num">${enabledIds.size}</span>
        <span class="loc-counter-label">/ ${ALL_LOCATIONS.length} konum seçili</span>
      </div>
      <div class="loc-manager-grid" id="loc-grid">
        ${ALL_LOCATIONS.map(loc => `
          <button type="button" aria-label="Konumu seç veya kaldır" class="loc-toggle-card ${enabledIds.has(loc.id) ? 'active' : ''}" data-loc-id="${loc.id}">
            <span class="loc-toggle-emoji">${loc.emoji}</span>
            <span class="loc-toggle-name">${loc.name}</span>
            <span class="loc-toggle-check">${enabledIds.has(loc.id) ? '✓' : ''}</span>
          </button>
        `).join('')}
      </div>
      <div class="loc-manager-hint">
        ⚠️ En az ${MIN_LOCATIONS} konum seçili olmalıdır
      </div>
    </div>
  `;

  const modal = showModal('📍 KONUM YÖNETİMİ', contentHTML, {
    footer: `
      <button class="btn btn-ghost" id="loc-cancel">İptal</button>
      <button class="btn btn-primary" id="loc-save">Kaydet</button>
    `,
    onMount: (overlay) => {
      const grid = overlay.querySelector('#loc-grid');
      const counterNum = overlay.querySelector('#loc-counter-num');
      const searchInput = overlay.querySelector('#loc-search');

      // Update counter display
      function updateCounter() {
        counterNum.textContent = enabledIds.size;
        counterNum.className = `loc-counter-num ${enabledIds.size < MIN_LOCATIONS ? 'danger' : ''}`;
      }

      // Toggle individual location
      grid.addEventListener('click', (e) => {
        const card = e.target.closest('.loc-toggle-card');
        if (!card) return;

        const locId = parseInt(card.dataset.locId);

        if (enabledIds.has(locId)) {
          if (enabledIds.size <= MIN_LOCATIONS) {
            showToast(`En az ${MIN_LOCATIONS} konum seçili olmalıdır!`, 'warning');
            card.classList.add('animate-shake');
            setTimeout(() => card.classList.remove('animate-shake'), 400);
            return;
          }
          enabledIds.delete(locId);
          card.classList.remove('active');
          card.querySelector('.loc-toggle-check').textContent = '';
        } else {
          enabledIds.add(locId);
          card.classList.add('active');
          card.querySelector('.loc-toggle-check').textContent = '✓';
        }

        updateCounter();
      });

      // Select All
      overlay.querySelector('#loc-select-all').addEventListener('click', () => {
        ALL_LOCATIONS.forEach(loc => enabledIds.add(loc.id));
        grid.querySelectorAll('.loc-toggle-card').forEach(card => {
          if (!card.classList.contains('loc-hidden')) {
            card.classList.add('active');
            card.querySelector('.loc-toggle-check').textContent = '✓';
          }
        });
        updateCounter();
      });

      // Deselect All (to minimum)
      overlay.querySelector('#loc-deselect-all').addEventListener('click', () => {
        // Keep first MIN_LOCATIONS enabled
        enabledIds.clear();
        const visible = [...grid.querySelectorAll('.loc-toggle-card:not(.loc-hidden)')];
        visible.forEach((card, i) => {
          const locId = parseInt(card.dataset.locId);
          if (i < MIN_LOCATIONS) {
            enabledIds.add(locId);
            card.classList.add('active');
            card.querySelector('.loc-toggle-check').textContent = '✓';
          } else {
            card.classList.remove('active');
            card.querySelector('.loc-toggle-check').textContent = '';
          }
        });
        updateCounter();
        showToast(`İlk ${MIN_LOCATIONS} konum seçili bırakıldı.`, 'info');
      });

      // Search filter
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        grid.querySelectorAll('.loc-toggle-card').forEach(card => {
          const locId = parseInt(card.dataset.locId);
          const loc = ALL_LOCATIONS.find(l => l.id === locId);
          const match = !query || loc.name.toLowerCase().includes(query);
          card.classList.toggle('loc-hidden', !match);
        });
      });

      // Cancel
      overlay.querySelector('#loc-cancel').addEventListener('click', closeModal);

      // Save
      overlay.querySelector('#loc-save').addEventListener('click', () => {
        if (enabledIds.size < MIN_LOCATIONS) {
          showToast(`En az ${MIN_LOCATIONS} konum seçili olmalıdır!`, 'error');
          return;
        }
        onSave([...enabledIds].sort((a, b) => a - b));
        closeModal();
        showToast(`${enabledIds.size} konum seçildi.`, 'success');
      });

      // Focus search
      searchInput.focus();
    }
  });
}

/**
 * Get location name by ID
 */
export function getLocationName(id) {
  return ALL_LOCATIONS.find(l => l.id === id)?.name || '?';
}

/**
 * Get all locations
 */
export function getAllLocations() {
  return ALL_LOCATIONS;
}
