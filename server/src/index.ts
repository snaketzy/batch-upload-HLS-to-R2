import fs from "node:fs";
import path from "node:path";
import express from "express";
import {
  DEFAULT_PREFIX,
  ENV_PATH,
  MAX_DIRS,
  PORT,
  PROJECT_ROOT,
  config,
  credentialsReady,
  missingCredentials,
} from "./config";
import { listDirs, roots, summarizeDir } from "./browse";
import { listR2Dirs, normalizeR2Prefix } from "./r2";
import { jobManager, type UploadSource } from "./jobs";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    bucket: config.bucket,
    accountId: config.accountId,
    publicDomain: config.publicDomain,
    prefix: DEFAULT_PREFIX,
    maxDirs: MAX_DIRS,
    envPath: ENV_PATH,
    credentialsReady,
    missing: missingCredentials,
  });
});

app.get("/api/fs/roots", (_req, res) => {
  res.json(roots());
});

app.get("/api/fs/list", (req, res) => {
  try {
    const target = typeof req.query.path === "string" ? req.query.path : undefined;
    res.json(listDirs(target));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/fs/summarize", async (req, res) => {
  const dirs: string[] = Array.isArray(req.body?.dirs) ? req.body.dirs : [];
  if (dirs.length === 0) return res.json([]);
  if (dirs.length > MAX_DIRS) {
    return res.status(400).json({ error: `最多只能选择 ${MAX_DIRS} 个目录` });
  }
  const summaries = await Promise.all(dirs.map((d) => summarizeDir(d)));
  res.json(summaries);
});

app.get("/api/r2/list", async (req, res) => {
  if (!credentialsReady) {
    return res.status(400).json({
      error: `R2 凭证不完整，请在 ${ENV_PATH} 中补全：${missingCredentials.join(", ")}`,
    });
  }
  try {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : "";
    res.json(await listR2Dirs(prefix));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/uploads", async (req, res) => {
  if (!credentialsReady) {
    return res.status(400).json({
      error: `R2 凭证不完整，请在 ${ENV_PATH} 中补全：${missingCredentials.join(", ")}`,
    });
  }
  const body = req.body ?? {};
  const dirs: string[] = Array.isArray(body.dirs) ? body.dirs : [];
  const singleDir: string = typeof body.dir === "string" ? body.dir.trim() : "";
  const targetPath: string = typeof body.targetPath === "string" ? body.targetPath : "";
  const prefix: string = typeof body.prefix === "string" ? body.prefix : DEFAULT_PREFIX;

  let sources: UploadSource[];
  if (singleDir) {
    const targetPrefix = normalizeR2Prefix(targetPath);
    if (!targetPrefix) {
      return res.status(400).json({ error: "请填写目标 R2 路径，例如 HLS/tt22022452/H264" });
    }
    sources = [{ localPath: singleDir, targetPrefix }];
  } else {
    if (dirs.length === 0) return res.status(400).json({ error: "没有选择任何目录" });
    if (dirs.length > MAX_DIRS) {
      return res.status(400).json({ error: `最多只能选择 ${MAX_DIRS} 个目录` });
    }
    const base = normalizeR2Prefix(prefix);
    sources = dirs.map((d) => {
      const name = path.basename(path.resolve(d));
      return { localPath: d, targetPrefix: base ? `${base}/${name}` : name };
    });
  }

  try {
    const job = await jobManager.create({ sources });
    res.json(job.snapshot());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/uploads", (_req, res) => {
  res.json(jobManager.summaryList());
});

app.get("/api/uploads/:id", (req, res) => {
  const job = jobManager.get(req.params.id);
  if (!job) return res.status(404).json({ error: "任务不存在" });
  res.json(job.snapshot());
});

app.get("/api/uploads/:id/stream", (req, res) => {
  const job = jobManager.get(req.params.id);
  if (!job) return res.status(404).end();

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = () => res.write(`data: ${JSON.stringify(job.snapshot())}\n\n`);
  send();

  const onUpdate = () => send();
  job.emitter.on("update", onUpdate);

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    job.emitter.off("update", onUpdate);
  });
});

app.post("/api/uploads/:id/cancel", (req, res) => {
  const job = jobManager.get(req.params.id);
  if (!job) return res.status(404).json({ error: "任务不存在" });
  job.cancel();
  res.json(job.snapshot());
});

// 生产模式：直接托管构建好的前端
const webDist = path.join(PROJECT_ROOT, "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[server] http://127.0.0.1:${PORT}`);
  console.log(`[server] bucket=${config.bucket || "(未配置)"} prefix=${DEFAULT_PREFIX}`);
  if (!credentialsReady) {
    console.warn(`[server] ⚠️  R2 凭证不完整，缺少: ${missingCredentials.join(", ")}`);
  }
});
