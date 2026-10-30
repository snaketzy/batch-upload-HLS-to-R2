export function formatBytes(bytes: number, digits = 2): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

/** 连接速度：统一用 Kbps 展示 */
export function formatKbps(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 Kbps";
  const kbps = (bytesPerSec * 8) / 1000;
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(2)} Mbps`;
  return `${kbps.toFixed(0)} Kbps`;
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 粗略估算剩余时间（毫秒） */
export function estimateEta(remainingBytes: number, bytesPerSec: number): number {
  if (!bytesPerSec || bytesPerSec <= 0 || remainingBytes <= 0) return 0;
  return (remainingBytes / bytesPerSec) * 1000;
}

export function percent(done: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 1000) / 10);
}
