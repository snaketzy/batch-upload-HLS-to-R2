import fs from "node:fs";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { PART_SIZE, providers, type StorageProvider } from "./config";

const clients: Partial<Record<StorageProvider, S3Client>> = {};

export function getStorageConfig(provider: StorageProvider) {
  return providers[provider];
}

export function getStorageClient(provider: StorageProvider): S3Client {
  if (!clients[provider]) {
    const target = getStorageConfig(provider);
    clients[provider] = new S3Client({
      region: target.region,
      endpoint: target.endpoint,
      credentials: {
        accessKeyId: target.accessKey,
        secretAccessKey: target.secret,
      },
    });
  }
  return clients[provider]!;
}

/**
 * 扩展名 -> Content-Type。
 * 等价于 rclone 那套「两趟上传」的效果：一次上传即写入正确的线上类型，
 * 尤其是 .vtt 必须显式为 text/vtt（否则会落成 application/octet-stream）。
 */
const MIME: Record<string, string> = {
  ".m3u8": "application/x-mpegurl",
  ".m4s": "application/octet-stream",
  ".mp4": "video/mp4",
  ".m4a": "audio/mp4",
  ".m4v": "video/mp4",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".aac": "audio/aac",
  ".mp3": "audio/mpeg",
  ".ac3": "audio/ac3",
  ".ec3": "audio/ec3",
  ".key": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function contentTypeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/**
 * 清单类对象（master / variant m3u8、外挂 PGS index.json 与悬停缩略图 index.json）的缓存策略。
 * 这些是固定路径的覆盖式上传，若走 CDN/浏览器的默认长缓存，
 * 重新上传后仍会命中旧副本，导致分辨率档位、音轨名、内嵌与 PGS 字幕名不更新，
 * 因此要求每次使用前回源校验。
 * 其余文件（.m4s/.ts/.mp4 等分片、thumbnails/*.jpg 雪碧图）返回 undefined，保持默认缓存策略。
 */
export function cacheControlFor(key: string): string | undefined {
  const lower = key.toLowerCase();
  if (lower.endsWith(".m3u8")) return "no-cache";
  if (/(^|\/)pgs-subs\/index\.json$/.test(lower)) return "no-cache";
  if (/(^|\/)thumbnails\/index\.json$/.test(lower)) return "no-cache";
  return undefined;
}

/** 把用户输入归一化成对象存储前缀（去掉首尾斜杠） */
export function normalizeStoragePrefix(input: string): string {
  return (input ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

export function buildPublicUrl(provider: StorageProvider, key: string): string | null {
  const publicDomain = getStorageConfig(provider).publicDomain;
  if (!publicDomain) return null;
  return `${publicDomain}/${key}`;
}

export interface RunningUpload {
  done: Promise<void>;
  abort: () => void;
}

/** 启动单文件上传（lib-storage 分片并发），返回可中止句柄 */
export function startUpload(opts: {
  provider: StorageProvider;
  localPath: string;
  key: string;
  contentType: string;
  onProgress?: (deltaBytes: number) => void;
}): RunningUpload {
  const target = getStorageConfig(opts.provider);
  const cacheControl = cacheControlFor(opts.key);
  const upload = new Upload({
    client: getStorageClient(opts.provider),
    params: {
      Bucket: target.bucket,
      Key: opts.key,
      Body: fs.createReadStream(opts.localPath),
      ContentType: opts.contentType,
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
    },
    queueSize: 4,
    partSize: PART_SIZE,
    leavePartsOnError: false,
  });

  let last = 0;
  upload.on("httpUploadProgress", (p) => {
    const loaded = p.loaded ?? 0;
    const delta = loaded - last;
    if (delta > 0) {
      last = loaded;
      opts.onProgress?.(delta);
    }
  });

  return {
    done: upload.done().then(() => undefined),
    abort: () => {
      void Promise.resolve(upload.abort()).catch(() => {});
    },
  };
}
