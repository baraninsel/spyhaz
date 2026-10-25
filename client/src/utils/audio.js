import { readStorage, writeStorage } from '../state.js';
let muted = readStorage('spyhaz_muted', 'false') === 'true', ctx = null, unlocked = false;
export const getMuteState = () => muted;
export function toggleMute() { muted = !muted; writeStorage('spyhaz_muted', String(muted)); return muted; }
async function unlock() {
  try {
    const Constructor = window.AudioContext || window.webkitAudioContext;
    if (!Constructor) return;
    ctx ||= new Constructor();
    await ctx.resume(); unlocked = ctx.state === 'running';
  } catch { unlocked = false; }
}
document.addEventListener('pointerdown', unlock, { passive: true });
document.addEventListener('keydown', unlock);
function tone(frequency, duration = 0.12) {
  if (muted || !unlocked || !ctx || ctx.state !== 'running' || document.hidden) return;
  try {
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(ctx.currentTime + duration);
  } catch { /* sound must never interrupt gameplay */ }
}
export const playSFX = { join: () => tone(880), start: () => tone(660, .25), turn: () => tone(740), tick: () => tone(600, .04), alert: () => tone(330), win: () => tone(880, .4), lose: () => tone(220, .3) };
