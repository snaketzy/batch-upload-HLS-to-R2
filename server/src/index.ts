import fs from "node:fs";
import path from "node:path";
import express from "express";
import {
  DEFAULT_PREFIX,
  ENV_PATH,
  MAX_DIRS,
  PORT,
  PROJECT_ROOT,
  credentialsReady,
  missingCredentials,
  providers,
  type StorageProvider,
} from "./config";
import { listDirs, roots, summarizeDir } from "./browse";
import { deleteR2Prefix, listR2Dirs, normalizeR2Prefix, statR2Prefix } from "./r2";
import { getRenameTask, startRename } from "./r2rename";
import { jobManager, type UploadSource } from "./jobs";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    prefix: DEFAULT_PREFIX,
    maxDirs: MAX_DIRS,
    envPath: ENV_PATH,
    defaultProvider: "r2",
    providers: {
      r2: {
        label: providers.r2.label,
        bucket: providers.r2.bucket,
        publicDomain: providers.r2.publicDomain,
        credentialsReady: credentialsReady.r2,
        missing: missingCredentials.r2,
      },
      cos: {
        label: providers.cos.label,
        bucket: providers.cos.bucket,
        publicDomain: providers.cos.publicDomain,
        credentialsReady: credentialsReady.cos,
        missing: missingCredentials.cos,
      },
    },
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
  if (!credentialsReady.r2) {
    return res.status(400).json({
      error: `R2 凭证不完整，请在 ${ENV_PATH} 中补全：${missingCredentials.r2.join(", ")}`,
    });
  }
  try {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : "";
    res.json(await listR2Dirs(prefix));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/r2/stat", async (req, res) => {
  if (!credentialsReady.r2) {
    return res.status(400).json({
      error: `R2 凭证不完整，请在 ${ENV_PATH} 中补全：${missingCredentials.r2.join(", ")}`,
    });
  }
  try {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : "";
    res.json(await statR2Prefix(prefix));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/r2/delete", async (req, res) => {
  if (!credentialsReady.r2) {
    return res.status(400).json({
      error: `R2 凭证不完整，请在 ${ENV_PATH} 中补全：${missingCredentials.r2.join(", ")}`,
    });
  }
  try {
    const prefix = typeof req.body?.prefix === "string" ? req.body.prefix : "";
    const deleted = await deleteR2Prefix(prefix);
    res.json({ prefix: normalizeR2Prefix(prefix), deleted });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/r2/rename", async (req, res) => {
  if (!credentialsReady.r2) {
    return res.status(400).json({
      error: `R2 凭证不完整，请在 ${ENV_PATH} 中补全：${missingCredentials.r2.join(", ")}`,
    });
  }
  try {
    const from = typeof req.body?.from === "string" ? req.body.from : "";
    const to = typeof req.body?.to === "string" ? req.body.to : "";
    res.json(await startRename(from, to));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/r2/rename/:id", (req, res) => {
  const task = getRenameTask(req.params.id);
  if (!task) return res.status(404).json({ error: "任务不存在" });
  res.json(task);
});

app.post("/api/uploads", async (req, res) => {
  const body = req.body ?? {};
  const dirs: string[] = Array.isArray(body.dirs) ? body.dirs : [];
  const singleDir: string = typeof body.dir === "string" ? body.dir.trim() : "";
  const targetPath: string = typeof body.targetPath === "string" ? body.targetPath : "";
  const prefix: string = typeof body.prefix === "string" ? body.prefix : DEFAULT_PREFIX;
  const provider: StorageProvider = body.provider === "cos" ? "cos" : "r2";

  if (!credentialsReady[provider]) {
    return res.status(400).json({
      error: `${providers[provider].label} 凭证不完整，请在 ${ENV_PATH} 中补全：${missingCredentials[
        provider
      ].join(", ")}`,
    });
  }

  let sources: UploadSource[];
  if (singleDir) {
    const targetPrefix = normalizeR2Prefix(targetPath);
    if (!targetPrefix) {
      return res
        .status(400)
        .json({ error: `请填写目标${provider === "cos" ? " COS" : " R2"}路径，例如 HLS/tt22022452/H264` });
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
    const job = await jobManager.create({ provider, sources });
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
  console.log(
    `[server] r2=${providers.r2.bucket || "(未配置)"} cos=${providers.cos.bucket || "(未配置)"} prefix=${DEFAULT_PREFIX}`,
  );
  for (const provider of ["r2", "cos"] as StorageProvider[]) {
    if (!credentialsReady[provider]) {
      console.warn(
        `[server] ⚠️  ${providers[provider].label} 凭证不完整，缺少: ${missingCredentials[
          provider
        ].join(", ")}`,
      );
    }
  }
});
