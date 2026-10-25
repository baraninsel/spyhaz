import { validateSettings, ALL_LOCATION_IDS } from '../../../shared/rules.js';
import { readStorage, writeStorage } from '../state.js';
const KEY = 'spyhaz_presets';
const DEFAULTS = [
  { id: '__default_classic', name: 'Klasik · 30 konum, 8 dakika', duration: 480, spyCount: 1, professions: false, enabledLocationIds: ALL_LOCATION_IDS },
  { id: '__default_mini', name: 'Küçük grup · 10 konum, 6 dakika', duration: 360, spyCount: 1, professions: false, enabledLocationIds: [1,2,5,7,12,13,20,21,24,28] },
  { id: '__default_party', name: 'Kalabalık · 2 casus, 10 dakika', duration: 600, spyCount: 2, professions: false, enabledLocationIds: ALL_LOCATION_IDS },
  { id: '__default_classroom', name: '13–15 kişi · 2 casus, 12 dakika', duration: 720, spyCount: 2, professions: false, enabledLocationIds: ALL_LOCATION_IDS },
];
const own = () => { try { const value = JSON.parse(readStorage(KEY, '[]')); return Array.isArray(value) ? value : []; } catch { return []; } };
function normalize(preset) {
  // v1 presets used spyGuessCount. It is intentionally ignored: every spy now has one guess.
  return { ...validateSettings({ duration: preset.duration, spyCount: preset.spyCount ?? 1, professions: preset.professions ?? false, enabledLocationIds: preset.enabledLocationIds }) };
}
export function getPresets() {
  return [...DEFAULTS, ...own()].flatMap(p => { try { return [{ ...p, ...normalize(p) }]; } catch { return []; } });
}
export function loadPreset(id) { const p = getPresets().find(p => p.id === id); return p ? normalize(p) : null; }
export function savePreset(name, settings) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Ayar adı gerekli.');
  const record = { id: crypto.randomUUID(), name: name.trim().slice(0,20), ...validateSettings(settings) };
  if (!writeStorage(KEY, JSON.stringify([...own(), record]))) throw new Error('Tarayıcı ayarı kaydedemedi. Metni dışa aktarabilirsin.');
  return record;
}
export const exportPresetText = settings => JSON.stringify({ v: 2, ...validateSettings(settings) }, null, 2);
export function importPresetFromText(text) {
  try { return normalize(JSON.parse(text)); } catch (error) { return { error: error.message || 'Geçersiz ayar metni.' }; }
}
export function deletePreset(id) { writeStorage(KEY, JSON.stringify(own().filter(p => p.id !== id))); }
export const getAllLocationIds = () => [...ALL_LOCATION_IDS];
