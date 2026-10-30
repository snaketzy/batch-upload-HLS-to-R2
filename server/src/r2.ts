import fs from "node:fs";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { PART_SIZE, config } from "./config";

let client: S3Client | null = null;

export function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secret,
      },
    });
  }
  return client;
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

export interface RunningUpload {
  done: Promise<void>;
  abort: () => void;
}

/** 启动单文件上传（lib-storage 分片并发），返回可中止句柄 */
export function startUpload(opts: {
  localPath: string;
  key: string;
  contentType: string;
  onProgress?: (deltaBytes: number) => void;
}): RunningUpload {
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: config.bucket,
      Key: opts.key,
      Body: fs.createReadStream(opts.localPath),
      ContentType: opts.contentType,
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
