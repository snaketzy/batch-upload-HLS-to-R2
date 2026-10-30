import { useState } from "react";
import { ArrowUp, Cloud, Folder, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useListR2DirsQuery } from "@/store/api";
import { normalizeR2Path } from "@/lib/utils";

interface R2PathPickerProps {
  bucket?: string;
  /** 当前目标路径，打开弹层时作为浏览起点 */
  value?: string;
  disabled?: boolean;
  onPick: (prefix: string) => void;
}

export function R2PathPicker({ bucket, value, disabled, onPick }: R2PathPickerProps) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("");

  const { data, isFetching, isError, error, refetch } = useListR2DirsQuery(prefix, {
    skip: !open,
    refetchOnMountOrArgChange: 5,
  });

  const current = data?.prefix ?? prefix;
  const errMsg = isError
    ? ((error as { data?: { error?: string } })?.data?.error ?? "读取 R2 目录失败")
    : null;

  const pick = (p: string) => {
    onPick(p);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setPrefix(normalizeR2Path(value ?? ""));
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

      <PopoverContent align="end" className="w-[380px] p-0">
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
          <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={`/${current}`}>
            /{current}
          </code>
          {isFetching && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => refetch()} title="刷新">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>

        <ScrollArea className="h-56">
          {errMsg ? (
            <p className="p-3 text-xs text-destructive">{errMsg}</p>
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
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {data?.truncated && (
          <p className="px-3 pt-1 text-[11px] text-muted-foreground">结果过多，仅显示前 1000 项</p>
        )}

        <div className="flex items-center gap-2 border-t border-border/60 p-2">
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={`/${current}`}>
            s3://{bucket || "…"}/{current}
          </p>
          <Button size="sm" className="h-7 shrink-0 text-xs" onClick={() => pick(current)}>
            选用当前目录
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
