import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getStorageClient, getStorageConfig, normalizeStoragePrefix } from "./storage";

/** stat / delete 扫描对象数量的上限 */
const STAT_LIMIT = 5000;

export function getClient() {
  return getStorageClient("r2");
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
  return normalizeStoragePrefix(input);
}

/** 列出 R2 某个前缀下的直接子目录（Delimiter="/"，只返回目录不返回文件） */
export async function listR2Dirs(rawPrefix: string): Promise<R2ListResult> {
  const prefix = normalizeR2Prefix(rawPrefix);
  const bucket = getStorageConfig("r2").bucket;
  const res = await getClient().send(
    new ListObjectsV2Command({
      Bucket: bucket,
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

export interface R2PrefixStat {
  prefix: string;
  /** 统计到的对象数；truncated 为 true 时是下界 */
  objects: number;
  bytes: number;
  truncated: boolean;
}

/** 统计某个前缀下的对象数量与体积（最多扫 STAT_LIMIT 个对象） */
export async function statR2Prefix(rawPrefix: string): Promise<R2PrefixStat> {
  const prefix = requirePrefix(rawPrefix);
  const keyPrefix = `${prefix}/`;
  const client = getClient();
  const bucket = getStorageConfig("r2").bucket;

  let objects = 0;
  let bytes = 0;
  let truncated = false;
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: keyPrefix,
        MaxKeys: Math.min(1000, STAT_LIMIT - objects),
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      objects += 1;
      bytes += o.Size ?? 0;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
    if (token && objects >= STAT_LIMIT) {
      truncated = true;
      break;
    }
  } while (token);

  return { prefix, objects, bytes, truncated };
}

/** 删除某个前缀下的所有对象，返回删除数量 */
export async function deleteR2Prefix(rawPrefix: string): Promise<number> {
  const prefix = requirePrefix(rawPrefix);
  const keyPrefix = `${prefix}/`;
  const client = getClient();
  const bucket = getStorageConfig("r2").bucket;

  let deleted = 0;
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: keyPrefix,
        MaxKeys: 1000,
        ContinuationToken: token,
      }),
    );
    const keys = (res.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k));
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      deleted += keys.length;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return deleted;
}

/** 归一化前缀，并拒绝空前缀（避免误删整个桶） */
function requirePrefix(input: string): string {
  const prefix = normalizeR2Prefix(input);
  if (!prefix) throw new Error("不允许操作桶根目录，请指定具体路径");
  return prefix;
}
