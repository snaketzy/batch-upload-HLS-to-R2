# batch-upload-HLS-to-R2

批量把本地 HLS 目录（每个目录含 HEVC / H264 两套切片）上传到 Cloudflare R2。

- 后端：Node 22 + Express + `@aws-sdk/client-s3`（读取本机目录，直传 R2，SSE 推送进度）
- 前端：React 19 + Vite + Tailwind + shadcn 风格组件 + Redux Toolkit

## 启动

需要 Node 22（本机在 `~/.nvm/versions/node/v22.22.0`）。

```bash
npm install
npm run dev
```

- 后端：http://127.0.0.1:8787
- 前端：Vite 地址（默认 5173，被占用会顺延，以终端输出为准），`/api` 已代理到后端

生产模式（后端直接托管前端构建产物）：

```bash
npm run build && npm start   # 访问 http://127.0.0.1:8787
```

## 配置

R2 账号信息读取根目录 `cloudflare.env`（已加入 `.gitignore`，不会提交）：

| 变量 | 用途 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | R2 端点，上传必需 |
| `CLOUDFLARE_R2_BUCKET` | 目标桶，上传必需 |
| `CLOUDFLARE_R2_ACCESS_KEY` / `CLOUDFLARE_R2_SECRET` | R2 API 令牌，上传必需 |
| `CLOUDFLARE_R2_PUBLIC_DOMAIN` | 生成在线播放地址 |

上传根前缀默认 `HLS`，可在界面上修改，或用环境变量 `R2_HLS_PREFIX` 覆盖。

## 上传规则

- 单次最多选 10 个目录；目录 `D` 映射为 `HLS/D/`，内部 `HEVC/`、`H264/` 子结构原样保留。
- Content-Type 按扩展名写入：`.m3u8` → `application/x-mpegurl`、`.m4s` → `application/octet-stream`、`.mp4` → `video/mp4`、`.vtt` → `text/vtt`、`.html/.js` 等自动识别。
- 跳过 `.DS_Store`。
- 完成后自动列出每个 `master.m3u8` 的在线地址（HEVC / H264 各一条）。

## 已知限制

- `r2.dev` 公共域不支持 CORS：桌面播放器、以及直接打开同源 `player.html` 可正常播放；本地页面跨源拉流会被浏览器拦截，需绑定自定义域名并配置 CORS 规则。
- 重复上传同一目录会整份重传（不做 size/mtime 去重）。

## 相关

`.trae/skills/upload-HLS-to-R2-pipeline/` 是等价的命令行流程（基于 rclone 两趟上传），保留作为参考与兜底。
