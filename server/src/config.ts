import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录（server/src -> ../..） */
export const PROJECT_ROOT = path.resolve(here, "..", "..");
export const ENV_PATH = path.join(PROJECT_ROOT, "cloudflare.env");

if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}

const env = process.env;

export type StorageProvider = "r2" | "cos";

export interface StorageTargetConfig {
  label: string;
  bucket: string;
  publicDomain: string;
  accessKey: string;
  secret: string;
  endpoint: string;
  region: string;
}

const r2AccountId = env.CLOUDFLARE_ACCOUNT_ID ?? "";
const cosBucket = env.TENCENT_COS_BUCKET ?? "";
const cosRegion = env.TENCENT_COS_REGION ?? "";

export const providers: Record<StorageProvider, StorageTargetConfig> = {
  r2: {
    label: "Cloudflare R2",
    bucket: env.CLOUDFLARE_R2_BUCKET ?? "",
    publicDomain: (env.CLOUDFLARE_R2_PUBLIC_DOMAIN ?? "").replace(/\/+$/, ""),
    accessKey: env.CLOUDFLARE_R2_ACCESS_KEY ?? "",
    secret: env.CLOUDFLARE_R2_SECRET ?? "",
    endpoint: r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : "",
    region: "auto",
  },
  cos: {
    label: "腾讯云 COS",
    bucket: cosBucket,
    publicDomain: (env.TENCENT_COS_PUBLIC_DOMAIN ?? "").replace(/\/+$/, ""),
    accessKey: env.TENCENT_COS_SECRET_ID ?? "",
    secret: env.TENCENT_COS_SECRET_KEY ?? "",
    endpoint:
      (env.TENCENT_COS_ENDPOINT ?? "").replace(/\/+$/, "") ||
      (cosRegion ? `https://cos.${cosRegion}.myqcloud.com` : ""),
    region: cosRegion,
  },
};

/** 凭证是否齐全（缺失时后端启动不崩，改为在发起上传时给出友好提示） */
export const credentialsReady: Record<StorageProvider, boolean> = {
  r2: Boolean(r2AccountId && providers.r2.bucket && providers.r2.accessKey && providers.r2.secret),
  cos: Boolean(
    providers.cos.bucket &&
      providers.cos.region &&
      providers.cos.accessKey &&
      providers.cos.secret,
  ),
};

export const missingCredentials: Record<StorageProvider, string[]> = {
  r2: [
    ["CLOUDFLARE_ACCOUNT_ID", r2AccountId],
    ["CLOUDFLARE_R2_BUCKET", providers.r2.bucket],
    ["CLOUDFLARE_R2_ACCESS_KEY", providers.r2.accessKey],
    ["CLOUDFLARE_R2_SECRET", providers.r2.secret],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k),
  cos: [
    ["TENCENT_COS_BUCKET", providers.cos.bucket],
    ["TENCENT_COS_REGION", providers.cos.region],
    ["TENCENT_COS_SECRET_ID", providers.cos.accessKey],
    ["TENCENT_COS_SECRET_KEY", providers.cos.secret],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k),
};

/** R2 上传根前缀，默认 HLS */
export const DEFAULT_PREFIX = env.R2_HLS_PREFIX ?? "HLS";

export const PORT = Number(env.PORT ?? 8787);

/** 单次最多可选目录数 */
export const MAX_DIRS = 10;

/** 同时上传的文件数（每个文件内部再由 lib-storage 并发分片） */
export const UPLOAD_CONCURRENCY = Math.max(1, Number(env.UPLOAD_CONCURRENCY ?? 16));

/** object 分片大小 8MB，与 rclone 侧保持一致 */
export const PART_SIZE = 8 * 1024 * 1024;
