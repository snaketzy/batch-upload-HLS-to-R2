import fs from "node:fs";
import path from "node:path";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
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

export interface R2DirEntry {
  name: string;
  prefix: string;
}

export interface R2ListResult {
  /** 当前列出的前缀（已去掉首尾斜杠），根目录为 "" */
  prefix: string;
  /** 上一级前缀；根目录为 null */
  parent: string | null;
  dirs: R2DirEntry[];
  /** 结果是否被截断（超过 1000 项） */
  truncated: boolean;
}

/** 把用户输入归一化成 R2 前缀（去掉首尾斜杠） */
export function normalizeR2Prefix(input: string): string {
  return (input ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

/** 列出 R2 某个前缀下的直接子目录（Delimiter="/"，只返回目录不返回文件） */
export async function listR2Dirs(rawPrefix: string): Promise<R2ListResult> {
  const prefix = normalizeR2Prefix(rawPrefix);
  const res = await getClient().send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix ? `${prefix}/` : "",
      Delimiter: "/",
      MaxKeys: 1000,
    }),
  );

  const dirs = (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix ?? "")
    .filter(Boolean)
    .map((full) => {
      const trimmed = full.replace(/\/+$/, "");
      return { name: trimmed.slice(trimmed.lastIndexOf("/") + 1), prefix: trimmed };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  return {
    prefix,
    parent: prefix ? prefix.split("/").slice(0, -1).join("/") : null,
    dirs,
    truncated: res.IsTruncated ?? false,
  };
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
