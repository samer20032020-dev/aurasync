export function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)) + ' ' + sizes[i];
}

export function formatPercent(used, total) {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((used / total) * 100));
}
