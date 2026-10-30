import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROJECT_ROOT } from "./config";

export interface DirEntry {
  name: string;
  path: string;
}

export interface ListResult {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

export interface FileRef {
  rel: string;
  abs: string;
  size: number;
}

export interface DirSummary {
  path: string;
  name: string;
  exists: boolean;
  totalFiles: number;
  totalBytes: number;
  /** 顶层子目录（如 HEVC / H264） */
  subdirs: string[];
  /** 所有 master 类 m3u8 的相对路径 */
  manifests: string[];
  error?: string;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 常用入口目录 */
export function roots(): DirEntry[] {
  const home = os.homedir();
  const candidates: DirEntry[] = [
    { name: "主目录", path: home },
    { name: "桌面", path: path.join(home, "Desktop") },
    { name: "下载", path: path.join(home, "Downloads") },
    { name: "影片", path: path.join(home, "Movies") },
    { name: "项目根", path: PROJECT_ROOT },
    { name: "外置卷 /Volumes", path: "/Volumes" },
    { name: "根目录 /", path: "/" },
  ];
  return candidates.filter((c) => isDir(c.path));
}

/** 列出某个目录下的子目录（隐藏目录不展示） */
export function listDirs(target?: string): ListResult {
  const abs = path.resolve(target && target.trim() ? target : os.homedir());
  const st = fs.statSync(abs);
  if (!st.isDirectory()) throw new Error(`不是目录: ${abs}`);

  const entries = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .filter((e) => e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(abs, e.name))))
    .map((e) => ({ name: e.name, path: path.join(abs, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));

  const parent = path.dirname(abs);
  return { path: abs, parent: parent === abs ? null : parent, entries };
}

/** 递归收集目录下所有文件（跳过 .DS_Store） */
export async function walkFiles(root: string): Promise<FileRef[]> {
  const out: FileRef[] = [];
  async function rec(dir: string) {
    const ents = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const e of ents) {
      if (e.name === ".DS_Store") continue;
      const abs = path.join(dir, e.name);
      let isDirectory = e.isDirectory();
      if (e.isSymbolicLink()) isDirectory = isDir(abs);
      if (isDirectory) {
        await rec(abs);
      } else if (e.isFile()) {
        const st = await fs.promises.stat(abs);
        out.push({ rel: path.relative(root, abs), abs, size: st.size });
      }
    }
  }
  await rec(root);
  return out;
}

export async function summarizeDir(dir: string): Promise<DirSummary> {
  const abs = path.resolve(dir);
  const name = path.basename(abs) || abs;
  const base: DirSummary = {
    path: abs,
    name,
    exists: false,
    totalFiles: 0,
    totalBytes: 0,
    subdirs: [],
    manifests: [],
  };
  try {
    const st = await fs.promises.stat(abs);
    if (!st.isDirectory()) return { ...base, error: "不是目录" };
    base.exists = true;
  } catch {
    return { ...base, error: "目录不存在或不可读" };
  }

  base.subdirs = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  const files = await walkFiles(abs);
  base.totalFiles = files.length;
  base.totalBytes = files.reduce((s, f) => s + f.size, 0);
  base.manifests = files
    .map((f) => f.rel.split(path.sep).join("/"))
    .filter((rel) => rel.toLowerCase().endsWith(".m3u8") && /(^|\/)master\.m3u8$/i.test(rel));

  return base;
}
