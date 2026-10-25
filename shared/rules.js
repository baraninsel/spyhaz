export const PROTOCOL_VERSION = 2;
export const MAX_PLAYERS = 15;
export const MIN_LOCATIONS = 10;
export const BALLOT_MS = 30_000;
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const HOST_GRACE_MS = 30_000;
export const ALL_LOCATION_IDS = Array.from({ length: 30 }, (_, i) => i + 1);
export const defaultSettings = () => ({ duration: 480, spyCount: 1, professions: false, enabledLocationIds: [...ALL_LOCATION_IDS] });
export function recommendedDuration(n) {
  return (n <= 4 ? 6 : n <= 6 ? 7 : n <= 8 ? 8 : n <= 10 ? 9 : n <= 12 ? 10 : 12) * 60;
}
export const approvalThreshold = n => Math.ceil(2 * (n - 1) / 3);
export function validateSettings(input, base = defaultSettings()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Geçersiz oyun ayarları.');
  const result = { ...base, enabledLocationIds: [...base.enabledLocationIds] };
  if ('duration' in input) {
    if (!Number.isInteger(input.duration) || input.duration < 60 || input.duration > 1800) throw new Error('Süre 1–30 dakika olmalı.');
    result.duration = input.duration;
  }
  if ('spyCount' in input) {
    if (![1, 2].includes(input.spyCount)) throw new Error('Casus sayısı 1 veya 2 olmalı.');
    result.spyCount = input.spyCount;
  }
  if ('professions' in input) {
    if (typeof input.professions !== 'boolean') throw new Error('Meslek ayarı geçersiz.');
    result.professions = input.professions;
  }
  if ('enabledLocationIds' in input) {
    const ids = input.enabledLocationIds;
    if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id) || !ALL_LOCATION_IDS.includes(id))) throw new Error('Geçersiz konum listesi.');
    result.enabledLocationIds = [...new Set(ids)];
    if (result.enabledLocationIds.length < MIN_LOCATIONS) throw new Error('En az 10 farklı konum seçilmeli.');
  }
  return result;
}
export function validateName(value) {
  if (typeof value !== 'string') throw new Error('İsim gerekli.');
  const name = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length < 2 || name.length > 20) throw new Error('İsim 2–20 karakter olmalı.');
  return name;
}
export function normalizeCode(value) {
  if (typeof value !== 'string') throw new Error('Oda kodu gerekli.');
  const code = value.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) throw new Error('Oda kodu 6 harf/rakam olmalı.');
  return code.slice(0, 3) + '-' + code.slice(3);
}
