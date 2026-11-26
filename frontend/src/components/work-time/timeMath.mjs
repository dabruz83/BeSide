export const formatDuration = (seconds = 0) => {
  const total = Math.max(0, Math.floor(seconds));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':');
};
export const elapsed = (session, now) => session ? session.effective_seconds +
  (session.status === 'running' ? Math.max(0, (now - session.sampledAt) / 1000) : 0) : 0;
export const progress = (seconds, hours) => hours > 0 ? {
  percent: Math.min(100, seconds / (hours * 36)),
  color: seconds > hours * 3600 ? 'bg-destructive' : seconds >= hours * 2880 ? 'bg-warning' : 'bg-success',
  remaining: hours * 3600 - seconds,
} : null;
