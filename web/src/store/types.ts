export type DirStatus = "pending" | "uploading" | "done" | "error" | "canceled";
export type JobStatus = "running" | "done" | "error" | "canceled";

export interface DirTask {
  name: string;
  r2Prefix: string;
  status: DirStatus;
  totalFiles: number;
  totalBytes: number;
  uploadedFiles: number;
  uploadedBytes: number;
  manifests: string[];
  error?: string;
}

export interface ActiveFile {
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
  dirs: DirTask[];
  active: ActiveFile[];
  errors: JobError[];
  urls: { dir: string; manifest: string; url: string }[];
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface ListResult {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

export interface R2DirEntry {
  name: string;
  prefix: string;
}

export interface R2ListResult {
  /** 当前列出的前缀，根目录为 "" */
  prefix: string;
  /** 上一级前缀；根目录为 null */
  parent: string | null;
  dirs: R2DirEntry[];
  truncated: boolean;
}

export interface R2PrefixStat {
  prefix: string;
  /** 统计到的对象数；truncated 为 true 时是下界 */
  objects: number;
  bytes: number;
  truncated: boolean;
}

export interface R2DeleteResult {
  prefix: string;
  deleted: number;
}

export interface R2RenameTask {
  id: string;
  from: string;
  to: string;
  status: "running" | "done" | "error";
  /** 源目录下的对象总数，列举完成前为 0 */
  total: number;
  copied: number;
  deleted: number;
  error?: string;
  startedAt: number;
  finishedAt: number;
}

export interface ConfigResult {
  bucket: string;
  accountId: string;
  publicDomain: string;
  prefix: string;
  maxDirs: number;
  envPath: string;
  credentialsReady: boolean;
  missing: string[];
}

export interface DirSummary {
  path: string;
  name: string;
  exists: boolean;
  totalFiles: number;
  totalBytes: number;
  subdirs: string[];
  manifests: string[];
  error?: string;
}
