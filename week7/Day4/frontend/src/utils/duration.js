// "3h 7m", "2d 4h", "45m". Works for lengths of time, so a negative value is shown without its sign.
export function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "-";

  const totalMinutes = Math.round(Math.abs(ms) / 60000);
  if (totalMinutes < 1) return "under 1m";

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export const formatRemaining = (ms) =>
  ms < 0 ? `Overdue by ${formatDuration(ms)}` : `${formatDuration(ms)} left`;

// A percentage that is null when there is nothing to measure yet.
export const formatPercent = (value) => (value === null || value === undefined ? "No data" : `${value}%`);
