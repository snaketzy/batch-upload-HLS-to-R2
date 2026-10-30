import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { UPLOAD_CONCURRENCY, config } from "./config";
import { contentTypeFor, startUpload } from "./r2";
import { walkFiles, type FileRef } from "./browse";

export type DirStatus = "pending" | "uploading" | "done" | "error" | "canceled";
export type JobStatus = "running" | "done" | "error" | "canceled";

export interface DirTask {
  name: string;
  localPath: string;
  /** R2 目标前缀，如 HLS/<目录名> */
  r2Prefix: string;
  status: DirStatus;
  totalFiles: number;
  totalBytes: number;
  uploadedFiles: number;
  uploadedBytes: number;
  manifests: string[];
  error?: string;
}

interface ActiveFile {
  dir: string;
  rel: string;
  loaded: number;
  size: number;
}

export interface JobError {
  dir: string;
  file: string;
  message: string;
}

export interface Snapshot {
  id: string;
  prefix: string;
  status: JobStatus;
  canceled: boolean;
  createdAt: number;
  startedAt: number;
  finishedAt: number;
  elapsedMs: number;
  speedBps: number;
  totals: {
    files: number;
    bytes: number;
    uploadedFiles: number;
    uploadedBytes: number;
  };
  dirs: Omit<DirTask, "localPath">[];
  active: ActiveFile[];
  errors: JobError[];
  urls: { dir: string; manifest: string; url: string }[];
}

const SAMPLE_WINDOW_MS = 4000;
const EMIT_INTERVAL_MS = 400;

export class UploadJob {
  readonly id = crypto.randomUUID();
  readonly createdAt = Date.now();
  readonly emitter = new EventEmitter();

  readonly prefix: string;
  readonly dirs: DirTask[];

  status: JobStatus = "running";
  canceled = false;
  startedAt = Date.now();
  finishedAt = 0;
  errors: JobError[] = [];

  private fileList: FileRef[] = [];
  private fileDirIndex: number[] = [];
  private active = new Map<string, ActiveFile>();
  private uploads = new Map<string, { abort: () => void }>();
  private samples: { t: number; bytes: number }[] = [];
  private lastEmitAt = 0;

  constructor(prefix: string, dirs: DirTask[], fileList: FileRef[], fileDirIndex: number[]) {
    this.prefix = prefix;
    this.dirs = dirs;
    this.fileList = fileList;
    this.fileDirIndex = fileDirIndex;
  }

  get jobTotalBytes(): number {
    return this.dirs.reduce((s, d) => s + d.totalBytes, 0);
  }

  private snapshotBytes(): number {
    return this.dirs.reduce((s, d) => s + d.uploadedBytes, 0);
  }

  private noteBytes(delta: number) {
    const now = Date.now();
    const total = this.snapshotBytes();
    const last = this.samples[this.samples.length - 1];
    if (last && now - last.t < 250) last.bytes = total;
    else this.samples.push({ t: now, bytes: total });
    while (this.samples.length > 2 && now - this.samples[0].t > SAMPLE_WINDOW_MS) this.samples.shift();
  }

  private computeSpeed(): number {
    if (this.status !== "running") return 0;
    const s = this.samples;
    if (s.length < 2) return 0;
    const dt = (s[s.length - 1].t - s[0].t) / 1000;
    if (dt <= 0) return 0;
    return Math.max(0, (s[s.length - 1].bytes - s[0].bytes) / dt);
  }

  private maybeEmit(force = false) {
    const now = Date.now();
    if (!force && now - this.lastEmitAt < EMIT_INTERVAL_MS) return;
    this.lastEmitAt = now;
    this.emitter.emit("update");
  }

  async run(): Promise<void> {
    const total = this.fileList.length;
    let cursor = 0;

    const worker = async () => {
      while (!this.canceled) {
        const i = cursor++;
        if (i >= total) return;
        await this.uploadOne(this.fileList[i], this.fileDirIndex[i]);
      }
    };

    const workers = Array.from(
      { length: Math.max(1, Math.min(UPLOAD_CONCURRENCY, total || 1)) },
      () => worker(),
    );
    await Promise.all(workers);

    for (const d of this.dirs) {
      if (this.canceled) d.status = "canceled";
      else if (d.status === "error") {
        /* 保留 */
      } else if (d.uploadedFiles < d.totalFiles) d.status = "error";
      else d.status = "done";
    }
    this.status = this.canceled ? "canceled" : this.errors.length ? "error" : "done";
    this.finishedAt = Date.now();
    this.maybeEmit(true);
    this.emitter.emit("done");
  }

  private async uploadOne(file: FileRef, dirIndex: number) {
    const dir = this.dirs[dirIndex];
    const keyId = `${dirIndex}:${file.rel}`;
    const relPosix = file.rel.split(path.sep).join("/");
    const key = `${dir.r2Prefix}/${relPosix}`;

    dir.status = "uploading";
    const entry: ActiveFile = { dir: dir.name, rel: relPosix, loaded: 0, size: file.size };
    this.active.set(keyId, entry);

    try {
      const running = startUpload({
        localPath: file.abs,
        key,
        contentType: contentTypeFor(file.rel),
        onProgress: (delta) => {
          entry.loaded += delta;
          dir.uploadedBytes += delta;
          this.noteBytes(delta);
          this.maybeEmit();
        },
      });
      this.uploads.set(keyId, running);
      await running.done;
      dir.uploadedFiles += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.canceled) {
        dir.status = "canceled";
      } else {
        dir.status = "error";
        if (!dir.error) dir.error = message;
        this.errors.push({ dir: dir.name, file: relPosix, message });
      }
    } finally {
      this.active.delete(keyId);
      this.uploads.delete(keyId);
      this.maybeEmit(true);
    }
  }

  cancel() {
    if (this.status !== "running") return;
    this.canceled = true;
    for (const [, u] of this.uploads) u.abort();
    this.maybeEmit(true);
  }

  snapshot(): Snapshot {
    const files = this.dirs.reduce((s, d) => s + d.totalFiles, 0);
    const bytes = this.dirs.reduce((s, d) => s + d.totalBytes, 0);
    const uploadedFiles = this.dirs.reduce((s, d) => s + d.uploadedFiles, 0);
    const uploadedBytes = this.dirs.reduce((s, d) => s + d.uploadedBytes, 0);
    return {
      id: this.id,
      prefix: this.prefix,
      status: this.status,
      canceled: this.canceled,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsedMs: (this.finishedAt || Date.now()) - this.startedAt,
      speedBps: this.computeSpeed(),
      totals: { files, bytes, uploadedFiles, uploadedBytes },
      dirs: this.dirs.map(({ localPath, ...rest }) => rest),
      active: [...this.active.values()].sort((a, b) => b.loaded - a.loaded).slice(0, 8),
      errors: this.errors.slice(0, 50),
      urls: this.buildUrls(),
    };
  }

  private buildUrls(): Snapshot["urls"] {
    if (!config.publicDomain || this.status !== "done") return [];
    const out: Snapshot["urls"] = [];
    for (const d of this.dirs) {
      for (const m of d.manifests) {
        out.push({
          dir: d.name,
          manifest: m,
          url: `${config.publicDomain}/${d.r2Prefix}/${m}`,
        });
      }
    }
    return out;
  }
}

class JobManager {
  private jobs = new Map<string, UploadJob>();

  get(id: string): UploadJob | undefined {
    return this.jobs.get(id);
  }

  summaryList() {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((j) => ({
        id: j.id,
        prefix: j.prefix,
        status: j.status,
        createdAt: j.createdAt,
        dirs: j.dirs.map((d) => d.name),
      }));
  }

  async create(opts: { dirs: string[]; prefix: string }): Promise<UploadJob> {
    const prefix = normalizePrefix(opts.prefix);
    const dirs: DirTask[] = [];
    const fileList: FileRef[] = [];
    const fileDirIndex: number[] = [];

    for (const raw of opts.dirs) {
      const abs = path.resolve(raw);
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(abs);
      } catch {
        throw new Error(`目录不存在: ${abs}`);
      }
      if (!stat.isDirectory()) throw new Error(`不是目录: ${abs}`);

      const name = path.basename(abs) || abs;
      const files = await walkFiles(abs);
      const manifests = files
        .map((f) => f.rel.split(path.sep).join("/"))
        .filter((rel) => /(^|\/)master\.m3u8$/i.test(rel));

      const idx = dirs.length;
      dirs.push({
        name,
        localPath: abs,
        r2Prefix: prefix ? `${prefix}/${name}` : name,
        status: "pending",
        totalFiles: files.length,
        totalBytes: files.reduce((s, f) => s + f.size, 0),
        uploadedFiles: 0,
        uploadedBytes: 0,
        manifests,
      });
      for (const f of files) {
        fileList.push(f);
        fileDirIndex.push(idx);
      }
    }

    const job = new UploadJob(prefix, dirs, fileList, fileDirIndex);
    this.jobs.set(job.id, job);
    void job.run();
    return job;
  }
}

function normalizePrefix(input: string): string {
  return (input ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

export const jobManager = new JobManager();
