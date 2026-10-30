import { CloudUpload, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DirectoryBrowser } from "@/features/browser/DirectoryBrowser";
import { UploadQueue } from "@/features/queue/UploadQueue";
import { useGetConfigQuery } from "@/store/api";

export default function App() {
  const { data: config } = useGetConfigQuery();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(0_0%_9%)] via-background to-background">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CloudUpload className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">HLS → Cloudflare R2</h1>
              <p className="text-xs text-muted-foreground">批量上传本地 HLS 目录</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              桶 {config?.bucket || "…"}
            </Badge>
            {config?.publicDomain && (
              <a
                href={config.publicDomain}
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:inline-flex"
              >
                {config.publicDomain.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            )}
            <Badge variant={config?.credentialsReady ? "success" : "destructive"}>
              {config?.credentialsReady ? "凭证就绪" : "凭证缺失"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-6 p-6 lg:grid-cols-2">
        <DirectoryBrowser />
        <UploadQueue />
      </main>
    </div>
  );
}
