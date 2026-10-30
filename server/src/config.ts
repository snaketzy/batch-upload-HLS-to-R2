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

export const config = {
  accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
  bucket: env.CLOUDFLARE_R2_BUCKET ?? "",
  publicDomain: (env.CLOUDFLARE_R2_PUBLIC_DOMAIN ?? "").replace(/\/+$/, ""),
  accessKey: env.CLOUDFLARE_R2_ACCESS_KEY ?? "",
  secret: env.CLOUDFLARE_R2_SECRET ?? "",
};

/** 凭证是否齐全（缺失时后端启动不崩，改为在发起上传时给出友好提示） */
export const credentialsReady = Boolean(
  config.accountId && config.bucket && config.accessKey && config.secret,
);

export const missingCredentials = [
  ["CLOUDFLARE_ACCOUNT_ID", config.accountId],
  ["CLOUDFLARE_R2_BUCKET", config.bucket],
  ["CLOUDFLARE_R2_ACCESS_KEY", config.accessKey],
  ["CLOUDFLARE_R2_SECRET", config.secret],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

/** R2 上传根前缀，默认 HLS */
export const DEFAULT_PREFIX = env.R2_HLS_PREFIX ?? "HLS";

export const PORT = Number(env.PORT ?? 8787);

/** 单次最多可选目录数 */
export const MAX_DIRS = 10;

/** 同时上传的文件数（每个文件内部再由 lib-storage 并发分片） */
export const UPLOAD_CONCURRENCY = Math.max(1, Number(env.UPLOAD_CONCURRENCY ?? 16));

/** object 分片大小 8MB，与 rclone 侧保持一致 */
export const PART_SIZE = 8 * 1024 * 1024;
