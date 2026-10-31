import crypto from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { config } from "./config";
import { getClient, normalizeR2Prefix } from "./r2";

/** 复制并发数 */
const COPY_CONCURRENCY = 16;
/** 批量删除的批次大小 */
const DELETE_BATCH = 1000;
/** 保留的历史任务数 */
const KEEP_TASKS = 20;

export type RenameStatus = "running" | "done" | "error";

export interface RenameTask {
  id: string;
  from: string;
  to: string;
  status: RenameStatus;
  /** 源目录下的对象总数（列举完成后才有值） */
  total: number;
  copied: number;
  deleted: number;
  error?: string;
  startedAt: number;
  finishedAt: number;
}

const tasks = new Map<string, RenameTask>();

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** CopySource 需要对 key 做编码，但保留分隔符 */
function copySource(bucket: string, key: string): string {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function listKeys(client: S3Client, prefix: string, limit = Number.POSITIVE_INFINITY): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: `${prefix}/`,
        MaxKeys: 1000,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) keys.push(o.Key);
      if (keys.length >= limit) return keys;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function run(task: RenameTask): Promise<void> {
  const client = getClient();
  try {
    const keys = await listKeys(client, task.from);
    task.total = keys.length;
    if (keys.length === 0) throw new Error(`源目录 ${task.from}/ 下没有对象`);

    // 先复制，全部成功后才删除原对象，避免中途失败导致数据丢失
    let cursor = 0;
    let failure: string | null = null;
    const workers = Array.from(
      { length: Math.min(COPY_CONCURRENCY, keys.length) },
      async () => {
        while (!failure) {
          const i = cursor++;
          if (i >= keys.length) return;
          const key = keys[i];
          const target = `${task.to}/${key.slice(task.from.length + 1)}`;
          try {
            await client.send(
              new CopyObjectCommand({
                Bucket: config.bucket,
                CopySource: copySource(config.bucket, key),
                Key: target,
              }),
            );
            task.copied += 1;
          } catch (err) {
            failure = `${key} → ${target}：${message(err)}`;
            return;
          }
        }
      },
    );
    await Promise.all(workers);
    if (failure) throw new Error(`复制失败已中止（原对象未删除）：${failure}`);

    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      task.deleted += batch.length;
    }

    task.status = "done";
  } catch (err) {
    task.status = "error";
    task.error = message(err);
  } finally {
    task.finishedAt = Date.now();
  }
}

export async function startRename(rawFrom: string, rawTo: string): Promise<RenameTask> {
  const from = normalizeR2Prefix(rawFrom);
  const to = normalizeR2Prefix(rawTo);
  if (!from || !to) throw new Error("源目录和目标目录都不能为空");
  if (from === to) throw new Error("新名称与原名称相同");
  if (from.startsWith(`${to}/`) || to.startsWith(`${from}/`)) {
    throw new Error("源目录与目标目录不能互相包含");
  }

  const client = getClient();
  const occupied = await listKeys(client, to, 1);
  if (occupied.length > 0) {
    throw new Error(`目标目录 ${to}/ 下已有对象，请先清空或换一个名称`);
  }

  const task: RenameTask = {
    id: crypto.randomUUID(),
    from,
    to,
    status: "running",
    total: 0,
    copied: 0,
    deleted: 0,
    startedAt: Date.now(),
    finishedAt: 0,
  };
  tasks.set(task.id, task);
  trim();
  void run(task);
  return task;
}

export function getRenameTask(id: string): RenameTask | undefined {
  return tasks.get(id);
}

function trim(): void {
  if (tasks.size <= KEEP_TASKS) return;
  for (const [id, task] of tasks) {
    if (task.status !== "running") {
      tasks.delete(id);
      if (tasks.size <= KEEP_TASKS) return;
    }
  }
}
