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
