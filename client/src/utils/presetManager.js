// Preset Manager - Save/Load/Delete/Import/Export game setting presets
const STORAGE_KEY = 'spyhaz_presets';
const ALL_LOCATION_IDS = Array.from({ length: 30 }, (_, i) => i + 1);

// Default presets with player count recommendations
// Spyfall balance: fewer players → fewer locations + shorter time
// More players → more locations + longer time for fair questioning rounds
const DEFAULT_PRESETS = [
  {
    id: '__default_classic',
    name: 'Klasik',
    icon: '🎯',
    isDefault: true,
    minPlayers: 5, maxPlayers: 8,
    duration: 480,
    spyGuessCount: 2,
    enabledLocationIds: [...ALL_LOCATION_IDS],
    description: '30 konum, 8 dk. Tam deneyim.',
  },
  {
    id: '__default_mini',
    name: 'Mini',
    icon: '⚡',
    isDefault: true,
    minPlayers: 3, maxPlayers: 4,
    duration: 300,
    spyGuessCount: 2,
    enabledLocationIds: [1, 2, 5, 7, 12, 13, 20, 21, 24, 28],
    description: '10 konum, 5 dk. Az kişiye ideal.',
  },
  {
    id: '__default_hard',
    name: 'Zor',
    icon: '💀',
    isDefault: true,
    minPlayers: 5, maxPlayers: 8,
    duration: 360,
    spyGuessCount: 1,
    enabledLocationIds: [3, 9, 11, 14, 19],
    description: '5 konum, 1 tahmin. Uzmanlar için.',
  },
  {
    id: '__default_quick',
    name: 'Hızlı',
    icon: '🏃',
    isDefault: true,
    minPlayers: 3, maxPlayers: 5,
    duration: 180,
    spyGuessCount: 3,
    enabledLocationIds: [1, 5, 12, 20, 21, 22, 24, 26],
    description: '8 konum, 3 dk. Kısa turlar.',
  },
  {
    id: '__default_party',
    name: 'Parti',
    icon: '🎉',
    isDefault: true,
    minPlayers: 6, maxPlayers: 8,
    duration: 600,
    spyGuessCount: 2,
    enabledLocationIds: [...ALL_LOCATION_IDS],
    description: '30 konum, 10 dk. Kalabalık grup.',
  },
  {
    id: '__default_duo',
    name: 'Üçlü',
    icon: '👥',
    isDefault: true,
    minPlayers: 3, maxPlayers: 3,
    duration: 240,
    spyGuessCount: 3,
    enabledLocationIds: [1, 5, 12, 20, 21, 24, 26],
    description: '7 konum, 4 dk. 3 kişi özel.',
  },
];

function getUserPresets() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveUserPresets(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function getPresets() {
  return [...DEFAULT_PRESETS, ...getUserPresets()];
}

export function getDefaultPresets() {
  return DEFAULT_PRESETS;
}

/**
 * Check if preset is recommended for given player count
 */
export function isRecommended(preset, playerCount) {
  if (!preset.minPlayers || !preset.maxPlayers) return false;
  return playerCount >= preset.minPlayers && playerCount <= preset.maxPlayers;
}

/**
 * Save current settings as a user preset
 */
export function savePreset(name, settings) {
  const presets = getUserPresets();
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const preset = {
    id,
    name: name.trim().slice(0, 20),
    icon: '📋',
    isDefault: false,
    duration: settings.duration || 480,
    spyGuessCount: settings.spyGuessCount || 2,
    enabledLocationIds: settings.enabledLocationIds || [...ALL_LOCATION_IDS],
    createdAt: Date.now(),
  };
  presets.push(preset);
  saveUserPresets(presets);
  return preset;
}

export function deletePreset(presetId) {
  const presets = getUserPresets();
  saveUserPresets(presets.filter(p => p.id !== presetId));
}

export function loadPreset(presetId) {
  const preset = getPresets().find(p => p.id === presetId);
  if (!preset) return null;
  return {
    duration: preset.duration,
    spyGuessCount: preset.spyGuessCount,
    enabledLocationIds: [...preset.enabledLocationIds],
  };
}

/**
 * Export settings as shareable text (JSON)
 */
export function exportPresetText(settings) {
  const data = {
    v: 1,
    name: settings.name || 'Özel Preset',
    duration: settings.duration,
    spyGuessCount: settings.spyGuessCount,
    enabledLocationIds: settings.enabledLocationIds,
  };
  return JSON.stringify(data);
}

/**
 * Import preset from pasted text. Returns settings or { error }.
 */
export function importPresetFromText(text) {
  try {
    const data = JSON.parse(text.trim());

    // Validate
    if (!data.enabledLocationIds || !Array.isArray(data.enabledLocationIds)) {
      return { error: 'Geçersiz format: enabledLocationIds bulunamadı.' };
    }
    if (data.enabledLocationIds.length < 5) {
      return { error: 'En az 5 konum gerekli.' };
    }

    const validIds = data.enabledLocationIds.filter(id =>
      Number.isInteger(id) && id >= 1 && id <= 30
    );
    if (validIds.length < 5) {
      return { error: 'Geçerli konum ID\'leri yetersiz (1-30 arası).' };
    }

    return {
      name: String(data.name || 'İçe Aktarılan').slice(0, 20),
      duration: Math.max(60, Math.min(900, Number(data.duration) || 480)),
      spyGuessCount: Math.max(1, Math.min(5, Number(data.spyGuessCount) || 2)),
      enabledLocationIds: validIds,
    };
  } catch {
    return { error: 'JSON formatı geçersiz. Doğru metni yapıştırdığınızdan emin olun.' };
  }
}

export function getAllLocationIds() {
  return [...ALL_LOCATION_IDS];
}
