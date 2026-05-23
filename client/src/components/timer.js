// Timer Component
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getTimerClass(remaining, duration) {
  const ratio = remaining / duration;
  if (ratio <= 0.1) return 'critical';  // last 10%
  if (ratio <= 0.2) return 'warning';   // last 20%
  return '';
}
