import {
  Check,
  ChevronDown,
  Cloud,
  CloudUpload,
  ExternalLink,
  FolderCog,
  Layers,
  Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DirectoryBrowser } from "@/features/browser/DirectoryBrowser";
import { UploadQueue } from "@/features/queue/UploadQueue";
import { SingleUploadPage } from "@/features/single/SingleUploadPage";
import { useAppDispatch, useAppSelector } from "@/store";
import { useGetConfigQuery } from "@/store/api";
import { MAX_DIRS, clear, remove, toggle } from "@/store/selectionSlice";
import {
  selectAllProviders,
  setMode,
  toggleProvider,
  type UploadMode,
} from "@/store/uiSlice";
import { cn } from "@/lib/utils";
import type { StorageProvider } from "@/store/types";

const MODE_META: Record<UploadMode, { label: string; hint: string; icon: typeof Layers }> = {
  batch: { label: "批量影片上传", hint: "批量上传本地 HLS 目录", icon: Layers },
  single: { label: "单独目录上传", hint: "上传单个目录到指定对象存储路径", icon: FolderCog },
};

const PROVIDER_META: Record<StorageProvider, { label: string; short: string; icon: typeof Cloud }> = {
  r2: { label: "Cloudflare R2", short: "R2", icon: Cloud },
  cos: { label: "腾讯云 COS", short: "COS", icon: Cloud },
};

export default function App() {
  const dispatch = useAppDispatch();
  const { data: config } = useGetConfigQuery();
  const mode = useAppSelector((s) => s.ui.mode);
  const selectedProviders = useAppSelector((s) => s.ui.selectedProviders);
  const selected = useAppSelector((s) => s.selection.dirs);

  const meta = MODE_META[mode];
  const ModeIcon = meta.icon;
  const allProvidersSelected = selectedProviders.length === 2;
  const providerButtonLabel = allProvidersSelected
    ? "全選"
    : selectedProviders.map((provider) => PROVIDER_META[provider].short).join(" + ");
  const primaryProvider = selectedProviders[0] ?? "r2";
  const PrimaryProviderIcon = allProvidersSelected
    ? CloudUpload
    : PROVIDER_META[primaryProvider].icon;
  const isBatch = mode === "batch";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(0_0%_9%)] via-background to-background">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CloudUpload className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">HLS → R2 / COS</h1>
              <p className="text-xs text-muted-foreground">{meta.hint}</p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-1 gap-2">
                  <ModeIcon className="size-4 text-primary" />
                  <span className="hidden sm:inline">{meta.label}</span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[12rem]">
                <DropdownMenuLabel>上传模式</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["batch", "single"] as UploadMode[]).map((m) => {
                  const item = MODE_META[m];
                  const ItemIcon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={m}
                      onSelect={() => dispatch(setMode(m))}
                      className={cn(mode === m && "bg-accent/60")}
                    >
                      <ItemIcon />
                      <span className="flex-1">{item.label}</span>
                      {mode === m && <Check className="size-3.5 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <PrimaryProviderIcon className="size-4 text-primary" />
                  <span>{providerButtonLabel}</span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[12rem]">
                <DropdownMenuLabel>上传目标</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    dispatch(selectAllProviders());
                  }}
                  className={cn(allProvidersSelected && "bg-accent/60")}
                >
                  <CloudUpload />
                  <span className="flex-1">全选</span>
                  {allProvidersSelected ? (
                    <Check className="size-3.5 text-primary" />
                  ) : selectedProviders.length > 0 ? (
                    <Minus className="size-3.5 text-muted-foreground" />
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(["r2", "cos"] as StorageProvider[]).map((p) => {
                  const item = PROVIDER_META[p];
                  const ItemIcon = item.icon;
                  const checked = selectedProviders.includes(p);
                  return (
                    <DropdownMenuItem
                      key={p}
                      onSelect={(event) => {
                        event.preventDefault();
                        dispatch(toggleProvider(p));
                      }}
                      className={cn(checked && "bg-accent/60")}
                    >
                      <ItemIcon />
                      <span className="flex-1">{item.label}</span>
                      {checked && <Check className="size-3.5 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            {selectedProviders.map((provider) => {
              const providerMeta = PROVIDER_META[provider];
              const providerConfig = config?.providers[provider];
              return (
                <div key={provider} className="flex items-center gap-2">
                  <Badge variant="secondary" className="hidden sm:inline-flex">
                    {providerMeta.short} 桶 {providerConfig?.bucket || "…"}
                  </Badge>
                  {providerConfig?.publicDomain && (
                    <a
                      href={providerConfig.publicDomain}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:inline-flex"
                    >
                      {providerConfig.publicDomain.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  <Badge variant={providerConfig?.credentialsReady ? "success" : "destructive"}>
                    {providerMeta.short} {providerConfig?.credentialsReady ? "凭证就绪" : "凭证缺失"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] p-6">
        {isBatch ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <DirectoryBrowser
              dirs={selected}
              maxDirs={MAX_DIRS}
              onToggle={(dir) => dispatch(toggle(dir))}
              onRemove={(dir) => dispatch(remove(dir))}
              onClear={() => dispatch(clear())}
            />
            <UploadQueue
              mode="batch"
              selectedProviders={selectedProviders}
              dirs={selected}
              onNewBatch={() => dispatch(clear())}
            />
          </div>
        ) : (
          <SingleUploadPage selectedProviders={selectedProviders} />
        )}
      </main>
    </div>
  );
}
