import { useState } from "react";
import { DirectoryBrowser } from "@/features/browser/DirectoryBrowser";
import { UploadQueue } from "@/features/queue/UploadQueue";

export function SingleUploadPage() {
  const [dirs, setDirs] = useState<string[]>([]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DirectoryBrowser
        dirs={dirs}
        maxDirs={1}
        title="选择单个目录"
        description="浏览并选择一个目录，右侧填写目标 R2 路径"
        emptyText="请选择一个要上传的目录"
        onToggle={(dir) => setDirs([dir])}
        onRemove={() => setDirs([])}
        onClear={() => setDirs([])}
      />
      <UploadQueue mode="single" dirs={dirs} onNewBatch={() => setDirs([])} />
    </div>
  );
}
