import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Cloud,
  Folder,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes } from "@/lib/format";
import { normalizeR2Path } from "@/lib/utils";
import {
  api,
  useDeleteR2PrefixMutation,
  useGetRenameTaskQuery,
  useListR2DirsQuery,
  useRenameR2PrefixMutation,
  useStatR2PrefixQuery,
} from "@/store/api";

interface R2PathPickerProps {
  bucket?: string;
  /** 当前目标路径，打开弹层时作为浏览起点 */
  value?: string;
  disabled?: boolean;
  onPick: (prefix: string) => void;
}

interface RenameForm {
  prefix: string;
  name: string;
}

/** 收敛用户输入的路径：去首尾斜杠、压缩重复斜杠 */
function normalizeTarget(input: string): string {
  return (input ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

/** 相对当前父目录的完整目标路径 */
function resolveTarget(source: string, input: string): string {
  const next = normalizeTarget(input);
  if (!next) return "";
  if (next.includes("/")) return next;
  const parent = source.split("/").slice(0, -1).join("/");
  return parent ? `${parent}/${next}` : next;
}

export function R2PathPicker({ bucket, value, disabled, onPick }: R2PathPickerProps) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [deleting, setDeleting] = useState<{ prefix: string; name: string } | null>(null);
  const [rename, setRename] = useState<RenameForm | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isFetching, isError, error, refetch } = useListR2DirsQuery(prefix, {
    skip: !open,
    refetchOnMountOrArgChange: 5,
  });

  const statTarget = deleting?.prefix ?? rename?.prefix ?? "";
  const {
    data: stat,
    isFetching: statLoading,
    isError: statFailed,
    error: statError,
  } = useStatR2PrefixQuery(statTarget, { skip: !statTarget });

  const [deletePrefix, { isLoading: confirmingDelete }] = useDeleteR2PrefixMutation();
  const [renamePrefix, { isLoading: startingRename }] = useRenameR2PrefixMutation();
  const { data: task } = useGetRenameTaskQuery(taskId ?? "", {
    skip: !taskId,
    pollingInterval: 800,
  });

  const current = data?.prefix ?? prefix;
  const listErr = isError
    ? ((error as { data?: { error?: string } })?.data?.error ?? "读取 R2 目录失败")
    : null;

  const pick = (p: string) => {
    onPick(p);
    setOpen(false);
  };

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const reset = () => {
    setDeleting(null);
    setRename(null);
    setRenameError(null);
    setFormError(null);
  };

  // 改名任务结束后收尾：刷新列表、提示、必要时跟随到新路径
  useEffect(() => {
    if (!taskId || !task || task.status === "running") return;
    setTaskId(null);
    if (task.status === "error") {
      setFormError(task.error ?? "重命名失败");
      return;
    }
    if (prefix === task.from || prefix.startsWith(`${task.from}/`)) {
      setPrefix(`${task.to}${prefix.slice(task.from.length)}`);
    } else {
      refetch();
    }
    flash(`已完成 → ${task.to}/（${task.copied} 个对象）`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, taskId, prefix]);

  const startRenameTask = async () => {
    if (!rename) return;
    const next = normalizeTarget(renameName);
    const to = resolveTarget(rename.prefix, renameName);
    if (!next) return setRenameError("请输入新名称或目标路径");
    if (to === rename.prefix) return setRenameError("目标路径与原路径相同");
    if (to.startsWith(`${rename.prefix}/`) || rename.prefix.startsWith(`${to}/`)) {
      return setRenameError("源目录与目标目录不能互相包含");
    }
    setRenameError(null);
    try {
      const started = await renamePrefix({ from: rename.prefix, to }).unwrap();
      setRename(null);
      setTaskId(started.id);
    } catch (e) {
      setRenameError((e as { data?: { error?: string } })?.data?.error ?? "重命名失败");
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setFormError(null);
    try {
      const res = await deletePrefix(deleting.prefix).unwrap();
      const removed = deleting.prefix;
      setDeleting(null);
      if (prefix === removed || prefix.startsWith(`${removed}/`)) {
        setPrefix(removed.split("/").slice(0, -1).join("/"));
      } else {
        // 立即从当前列表移除，不等重新请求回来
        api.util.updateQueryData("listR2Dirs", prefix, (draft) => {
          draft.dirs = draft.dirs.filter((d) => d.prefix !== removed);
        });
        refetch();
      }
      if (res.deleted === 0) {
        setFormError(`${removed}/ 下没有可删除的对象，请点刷新确认`);
      } else {
        flash(`已删除 ${removed} 下的 ${res.deleted} 个对象`);
      }
    } catch (e) {
      setFormError((e as { data?: { error?: string } })?.data?.error ?? "删除失败");
    }
  };

  const statLine = () => {
    if (statLoading) return "正在统计对象数量…";
    if (statFailed) {
      return (statError as { data?: { error?: string } })?.data?.error ?? "统计失败";
    }
    if (!stat) return "";
    return `${stat.truncated ? "至少 " : ""}${stat.objects} 个对象 · ${formatBytes(stat.bytes)}`;
  };

  const renderBody = () => {
    if (taskId) {
      if (!task) {
        return (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            正在启动重命名…
          </div>
        );
      }
      const done = task.copied + task.deleted;
      const pct = task.total ? Math.min(100, Math.round((done / (task.total * 2)) * 100)) : 0;
      return (
        <div className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            正在重命名 / 移动
          </p>
          <code className="block break-all text-[11px] text-muted-foreground">
            {task.from}/ → {task.to}/
          </code>
          <Progress value={pct} />
          <p className="text-xs">
            已复制 {task.copied}/{task.total || "…"} · 已删除 {task.deleted}
          </p>
          <p className="text-[11px] text-muted-foreground">
            可以关闭弹层，任务会在后台继续（先复制、全部成功后才删除原对象）。
          </p>
        </div>
      );
    }

    if (rename) {
      const target = resolveTarget(rename.prefix, renameName);
      const isMove =
        target !== "" &&
        target.split("/").slice(0, -1).join("/") !==
          rename.prefix.split("/").slice(0, -1).join("/");
      return (
        <div className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Pencil className="size-4" />
            重命名 / 移动目录
          </p>
          <p className="break-all text-xs text-muted-foreground">源：{rename.prefix}/</p>
          <Input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void startRenameTask();
            }}
            placeholder="新名称，或 HLS/tt123/H264 这样的完整路径"
            className="h-8 text-xs"
          />
          <p className="break-all text-[11px] text-muted-foreground">
            目标：{target ? `${target}/` : "…"} · {statLine()}
          </p>
          {target && !isMove && (
            <p className="text-[11px] text-muted-foreground">
              不带 / 时按当前目录下的新名称处理。
            </p>
          )}
          {renameError && <p className="text-xs text-destructive">{renameError}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={reset}>
              取消
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1"
              disabled={startingRename}
              onClick={startRenameTask}
            >
              {startingRename ? <Loader2 className="animate-spin" /> : <Pencil />}
              {startingRename ? "提交中…" : isMove ? "开始移动" : "开始重命名"}
            </Button>
          </div>
        </div>
      );
    }

    if (deleting) {
      return (
        <div className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />
            删除 {deleting.name}
          </p>
          <p className="text-xs text-muted-foreground">
            将删除 <code className="break-all text-foreground">{deleting.prefix}/</code>{" "}
            下的全部对象，此操作不可恢复。
          </p>
          <p className="text-xs font-medium">{statLine()}</p>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={reset}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1"
              disabled={confirmingDelete}
              onClick={doDelete}
            >
              {confirmingDelete ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {confirmingDelete ? "删除中…" : "确认删除"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={!data || data.parent === null}
            onClick={() => setPrefix(data?.parent ?? "")}
            title="上一级"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <code
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={`/${current}`}
          >
            /{current}
          </code>
          {isFetching && (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          )}
          {current && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => {
                reset();
                const name = current.split("/").pop() ?? current;
                setDeleting({ prefix: current, name });
              }}
              title="删除当前目录"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => refetch()}
            title="刷新"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>

        {formError && <p className="border-b border-border/60 px-3 py-1.5 text-[11px] text-destructive">{formError}</p>}
        {notice && (
          <p className="border-b border-border/60 bg-secondary/40 px-3 py-1.5 text-[11px] text-emerald-400">
            {notice}
          </p>
        )}

        <ScrollArea className="h-56">
          {listErr ? (
            <p className="p-3 text-xs text-destructive">{listErr}</p>
          ) : data && data.dirs.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">该前缀下没有子目录</p>
          ) : (
            <ul className="p-1">
              {data?.dirs.map((d) => (
                <li
                  key={d.prefix}
                  className="flex items-center gap-1 rounded-sm transition-colors hover:bg-accent/50"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                    onClick={() => setPrefix(d.prefix)}
                  >
                    <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs">{d.name}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={() => pick(d.prefix)}
                  >
                    选择
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-muted-foreground"
                    onClick={() => {
                      reset();
                      setRename({ prefix: d.prefix, name: d.name });
                      setRenameName(d.name);
                    }}
                    title={`重命名 ${d.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      reset();
                      setDeleting({ prefix: d.prefix, name: d.name });
                    }}
                    title={`删除 ${d.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {data?.truncated && (
          <p className="px-3 pt-1 text-[11px] text-muted-foreground">结果过多，仅显示前 1000 项</p>
        )}

        <div className="flex items-center gap-2 border-t border-border/60 p-2">
          <p
            className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
            title={`/${current}`}
          >
            s3://{bucket || "…"}/{current}
          </p>
          <Button size="sm" className="h-7 shrink-0 text-xs" onClick={() => pick(current)}>
            选用当前目录
          </Button>
        </div>
      </>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setPrefix(normalizeR2Path(value ?? ""));
          reset();
          setNotice(null);
        } else if (!taskId) {
          reset();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          disabled={disabled}
        >
          <Cloud className="size-3.5" />
          浏览远端
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[400px] p-0">
        {renderBody()}
      </PopoverContent>
    </Popover>
  );
}
