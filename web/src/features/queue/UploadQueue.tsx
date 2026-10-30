import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Rocket,
  Server,
  Square,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { estimateEta, formatBytes, formatDuration, formatKbps, percent } from "@/lib/format";
import { cn, normalizeR2Path } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  useCancelUploadMutation,
  useGetConfigQuery,
  useStartUploadMutation,
  useSummarizeMutation,
} from "@/store/api";
import type { DirSummary } from "@/store/types";
import type { UploadMode } from "@/store/uiSlice";
import { R2PathPicker } from "@/features/single/R2PathPicker";
import {
  connectionChanged,
  jobFailed,
  jobStarted,
  reset,
  snapshotReceived,
} from "@/store/uploadSlice";

const STATUS_LABEL: Record<string, string> = {
  pending: "等待中",
  uploading: "上传中",
  done: "已完成",
  error: "失败",
  canceled: "已取消",
  running: "上传中",
};

interface UploadQueueProps {
  mode: UploadMode;
  /** 待上传目录；批量模式为多个，单独模式为 0 或 1 个 */
  dirs: string[];
  /** 一批上传结束后清空当前选择 */
  onNewBatch: () => void;
}

export function UploadQueue({ mode, dirs, onNewBatch }: UploadQueueProps) {
  const dispatch = useAppDispatch();
  const { jobId, snapshot, connected, error } = useAppSelector((s) => s.upload);

  const { data: config } = useGetConfigQuery();
  const [prefix, setPrefix] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [summaries, setSummaries] = useState<DirSummary[]>([]);

  const [summarize] = useSummarizeMutation();
  const [startUpload, { isLoading: starting }] = useStartUploadMutation();
  const [cancelUpload, { isLoading: canceling }] = useCancelUploadMutation();

  useEffect(() => {
    if (config && prefix === "") setPrefix(config.prefix);
  }, [config, prefix]);

  // 单独模式：选中目录后，若目标路径为空，默认填 HLS/<目录名>
  useEffect(() => {
    if (mode !== "single" || dirs.length !== 1 || targetPath !== "") return;
    const name = dirs[0].split("/").filter(Boolean).pop() || "";
    if (name) setTargetPath(`HLS/${name}`);
  }, [mode, dirs, targetPath]);

  useEffect(() => {
    if (dirs.length === 0) {
      setSummaries([]);
      return;
    }
    let alive = true;
    summarize(dirs)
      .unwrap()
      .then((r) => {
        if (alive) setSummaries(r);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dirs, summarize]);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/uploads/${jobId}/stream`);
    es.onmessage = (ev) => {
      try {
        dispatch(snapshotReceived(JSON.parse(ev.data)));
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => dispatch(connectionChanged(false));
    return () => es.close();
  }, [jobId, dispatch]);

  const running = snapshot?.status === "running";
  const totalBytes = summaries.reduce((s, d) => s + d.totalBytes, 0);
  const totalFiles = summaries.reduce((s, d) => s + d.totalFiles, 0);
  const normalizedTarget = normalizeR2Path(targetPath);
  const isSingle = mode === "single";

  const canStart = isSingle
    ? dirs.length === 1 && normalizedTarget.length > 0
    : dirs.length > 0;

  const handleStart = async () => {
    dispatch(jobFailed(null));
    try {
      const snap = await startUpload(
        isSingle ? { dir: dirs[0], targetPath: normalizedTarget } : { dirs, prefix },
      ).unwrap();
      dispatch(jobStarted(snap));
    } catch (e) {
      const msg = (e as { data?: { error?: string } })?.data?.error ?? "启动上传失败";
      dispatch(jobFailed(msg));
    }
  };

  const handleCancel = async () => {
    if (jobId) await cancelUpload(jobId).catch(() => {});
  };

  const handleNew = () => {
    dispatch(reset());
    onNewBatch();
    setTargetPath("");
  };

  const eta = useMemo(
    () =>
      snapshot && running
        ? estimateEta(snapshot.totals.bytes - snapshot.totals.uploadedBytes, snapshot.speedBps)
        : 0,
    [snapshot, running],
  );

  const bucketPath = isSingle
    ? `${normalizedTarget || "…"}/…`
    : `${prefix || config?.prefix || "HLS"}/<目录名>/…`;

  return (
    <Card className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              上传队列
            </CardTitle>
            <CardDescription>
              目标：s3://{config?.bucket || "…"}/{bucketPath}
            </CardDescription>
          </div>
          {snapshot && (
            <Badge
              variant={
                snapshot.status === "done"
                  ? "success"
                  : snapshot.status === "error"
                    ? "destructive"
                    : snapshot.status === "canceled"
                      ? "secondary"
                      : "default"
              }
            >
              {STATUS_LABEL[snapshot.status] ?? snapshot.status}
            </Badge>
          )}
        </div>
      </CardHeader>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-5">
          {!config?.credentialsReady && config && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">R2 凭证不完整，无法上传。</p>
                <p className="mt-0.5 text-muted-foreground">
                  请在 {config.envPath} 补全：{config.missing.join("、")}
                </p>
              </div>
            </div>
          )}

          {!snapshot && (
            <>
              {isSingle ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      目标 R2 路径
                    </label>
                    <R2PathPicker
                      bucket={config?.bucket}
                      value={targetPath}
                      disabled={!config?.credentialsReady}
                      onPick={setTargetPath}
                    />
                  </div>
                  <Input
                    value={targetPath}
                    onChange={(e) => setTargetPath(e.target.value)}
                    placeholder="HLS/tt22022452/H264"
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    {normalizedTarget
                      ? `将上传到 s3://${config?.bucket || "…"}/${normalizedTarget}/…`
                      : "可粘贴完整播放地址，或点右上「浏览远端」选择已有目录"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">R2 前缀</label>
                  <Input
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="HLS"
                    className="h-9"
                  />
                </div>
              )}

              <Separator />

              {dirs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {isSingle ? "请先在左侧选择一个要上传的目录" : "请先在左侧选择要上传的 HLS 目录"}
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {isSingle ? "待上传目录" : `待上传 ${dirs.length} 个目录`}
                    </span>
                    <span>
                      合计 {totalFiles} 个文件 · {formatBytes(totalBytes)}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {summaries.map((s) => (
                      <li
                        key={s.path}
                        className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.error
                              ? s.error
                              : `${s.totalFiles} 文件 · ${formatBytes(s.totalBytes)} · ${
                                  s.subdirs.slice(0, 4).join(" / ") || "无子目录"
                                }`}
                          </p>
                        </div>
                        {s.manifests.length > 0 ? (
                          <Badge variant="outline" className="ml-2 shrink-0">
                            {s.manifests.length} 个 master
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="ml-2 shrink-0">
                            无 master.m3u8
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {snapshot && (
            <>
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-semibold tabular-nums">
                    {percent(snapshot.totals.uploadedBytes, snapshot.totals.bytes)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(snapshot.totals.uploadedBytes)} / {formatBytes(snapshot.totals.bytes)}
                  </span>
                </div>
                <Progress value={percent(snapshot.totals.uploadedBytes, snapshot.totals.bytes)} />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="文件" value={`${snapshot.totals.uploadedFiles}/${snapshot.totals.files}`} />
                <Stat
                  label="速度"
                  value={formatKbps(snapshot.speedBps)}
                  accent={running}
                />
                <Stat label="已用时" value={formatDuration(snapshot.elapsedMs)} />
                <Stat label="剩余" value={running ? formatDuration(eta) : "—"} />
              </div>

              <Separator />

              <ul className="space-y-2">
                {snapshot.dirs.map((d) => {
                  const p = percent(d.uploadedBytes, d.totalBytes);
                  return (
                    <li key={d.r2Prefix} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {d.status === "done" ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                          ) : d.status === "error" ? (
                            <AlertTriangle className="size-3.5 shrink-0 text-destructive-foreground" />
                          ) : (
                            <Loader2
                              className={cn(
                                "size-3.5 shrink-0 text-muted-foreground",
                                d.status === "uploading" && "animate-spin",
                              )}
                            />
                          )}
                          <span className="truncate font-medium">{d.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {d.uploadedFiles}/{d.totalFiles}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{p}%</span>
                      </div>
                      <Progress
                        value={p}
                        className="h-1.5"
                        indeterminate={d.status === "uploading" && p === 0}
                      />
                    </li>
                  );
                })}
              </ul>

              {snapshot.active.length > 0 && running && (
                <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">当前并发文件</p>
                  <ul className="space-y-1">
                    {snapshot.active.map((a) => (
                      <li key={`${a.dir}/${a.rel}`} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {a.dir}/{a.rel}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {percent(a.loaded, a.size)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {snapshot.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <p className="mb-1.5 text-xs font-medium">
                    错误 {snapshot.errors.length} 条（前 3 条）
                  </p>
                  <ul className="space-y-1">
                    {snapshot.errors.slice(0, 3).map((e, i) => (
                      <li key={i} className="truncate text-xs text-muted-foreground">
                        {e.dir}/{e.file} — {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {snapshot.urls.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <ThumbsUp className="size-3.5" />
                    在线播放地址
                  </p>
                  {snapshot.urls.map((u) => (
                    <div
                      key={u.url}
                      className="flex items-center gap-2 rounded-md border border-border/70 bg-secondary/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {u.dir} · {u.manifest}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.url}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-1 text-xs"
                        onClick={() => navigator.clipboard.writeText(u.url)}
                      >
                        <Copy className="size-3.5" />
                        复制
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t border-border/60 p-4">
        {!snapshot ? (
          <Button
            className="w-full gap-2"
            disabled={
              starting ||
              !canStart ||
              !config?.credentialsReady ||
              summaries.some((s) => !s.exists)
            }
            onClick={handleStart}
          >
            {starting ? <Loader2 className="animate-spin" /> : <Rocket />}
            {isSingle ? "开始上传" : `开始上传（${dirs.length} 个目录）`}
          </Button>
        ) : running ? (
          <Button variant="destructive" className="w-full gap-2" disabled={canceling} onClick={handleCancel}>
            <Square />
            取消上传
          </Button>
        ) : (
          <Button variant="secondary" className="w-full" onClick={handleNew}>
            {isSingle ? "继续上传下一个目录" : "继续上传下一批"}
          </Button>
        )}
      </div>

      {snapshot && running && (
        <div className="px-4 pb-3 text-center text-[11px] text-muted-foreground">
          {connected ? "实时进度已连接" : "进度连接已断开，正在重连…"}
        </div>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-medium tabular-nums", accent && "text-primary")}>
        {value}
      </p>
    </div>
  );
}
