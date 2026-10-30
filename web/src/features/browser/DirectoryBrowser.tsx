import { useEffect, useState } from "react";
import { ArrowUp, Folder, FolderCheck, HardDrive, Loader2, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppDispatch, useAppSelector } from "@/store";
import { useGetRootsQuery, useListDirsQuery } from "@/store/api";
import { MAX_DIRS, clear, remove, toggle } from "@/store/selectionSlice";
import { cn } from "@/lib/utils";

export function DirectoryBrowser() {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((s) => s.selection.dirs);
  const [path, setPath] = useState("");
  const [jump, setJump] = useState("");

  const { data: roots } = useGetRootsQuery();
  const { data, isFetching, isError, error } = useListDirsQuery(path);

  useEffect(() => {
    if (data?.path && path === "") setPath(data.path);
  }, [data, path]);

  const errMsg = isError
    ? ((error as { data?: { error?: string } })?.data?.error ?? "读取目录失败")
    : null;

  const selectedSet = new Set(selected);
  const full = selected.length >= MAX_DIRS;

  return (
    <Card className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="size-4 text-primary" />
              选择 HLS 目录
            </CardTitle>
            <CardDescription>点击目录名进入，点右侧按钮加入上传队列（最多 {MAX_DIRS} 个）</CardDescription>
          </div>
          <Badge variant={full ? "warning" : "secondary"} className="shrink-0">
            {selected.length} / {MAX_DIRS}
          </Badge>
        </div>
      </CardHeader>

      <div className="space-y-2 border-b border-border/60 p-4">
        <div className="flex flex-wrap gap-1.5">
          {roots?.map((r) => (
            <Button
              key={r.path}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPath(r.path)}
            >
              {r.name}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && jump.trim()) setPath(jump.trim());
            }}
            placeholder="粘贴绝对路径后回车，如 /Users/jerry/Movies/output"
            className="h-8 text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-8"
            disabled={!jump.trim()}
            onClick={() => setPath(jump.trim())}
          >
            前往
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          disabled={!data?.parent}
          onClick={() => data?.parent && setPath(data.parent)}
          title="上一级"
        >
          <ArrowUp />
        </Button>
        <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={data?.path}>
          {data?.path ?? "加载中…"}
        </code>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        <Button variant="ghost" size="icon" onClick={() => setPath(data?.path ?? path)} title="刷新">
          <RefreshCw />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {errMsg ? (
          <div className="p-6 text-sm text-destructive">{errMsg}</div>
        ) : data?.entries.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">该目录下没有子目录</div>
        ) : (
          <ul className="divide-y divide-border/50">
            {data?.entries.map((entry) => {
              const isSelected = selectedSet.has(entry.path);
              return (
                <li
                  key={entry.path}
                  className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-accent/50"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setPath(entry.path)}
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{entry.name}</span>
                  </button>
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="h-7 shrink-0 gap-1 text-xs"
                    disabled={!isSelected && full}
                    onClick={() => dispatch(toggle(entry.path))}
                  >
                    <FolderCheck className={cn("size-3.5", isSelected && "text-primary-foreground")} />
                    {isSelected ? "已加入" : "选择"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      <div className="border-t border-border/60 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">待上传目录</span>
          {selected.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => dispatch(clear())}
            >
              清空
            </Button>
          )}
        </div>
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚未选择目录</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((dir) => (
              <li
                key={dir}
                className="flex max-w-full items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1"
              >
                <span className="truncate text-xs" title={dir}>
                  {dir.split("/").pop() || dir}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => dispatch(remove(dir))}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
