import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 把用户输入归一化成 R2 对象前缀。
 * 支持直接粘贴完整播放地址（自动取 pathname 并去掉文件名），
 * 例如 https://pub-xxx.r2.dev/HLS/tt22022452/H264/master.m3u8 -> HLS/tt22022452/H264
 */
export function normalizeR2Path(input: string): string {
  let value = (input ?? "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
    } catch {
      /* 非法 URL 时按原文本处理 */
    }
  }

  const segments = value
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);

  // 最后一段像文件名（带扩展名）时视为「文件所在目录」
  const last = segments[segments.length - 1];
  if (segments.length > 1 && last && /\.[a-z0-9]{2,5}$/i.test(last)) {
    segments.pop();
  }

  return segments.join("/");
}
