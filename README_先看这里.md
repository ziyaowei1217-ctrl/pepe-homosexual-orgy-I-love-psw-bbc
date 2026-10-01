# Sublet Pipeline：源码交接与体验

这是学生及职场租房、转租与室友匹配网站的源码包。包含当前前后端、数据库迁移、自动化测试和部署配置。付款在本地使用演示模式，不会真实扣款。

## 先看界面，不安装环境

解压后用浏览器打开 `output/handoff-preview/index.html`，可离线查看本次截取的首页、搜索地图与房源详情。截图不执行登录、搜索或付款，完整交互需要启动网站。`output/product-showcase/` 另保留早期界面图库，供历史对照及原有测试使用。

## 启动完整网站（推荐）

准备 Node.js 22 LTS 或 24 LTS、Corepack/pnpm 和 Docker Desktop（Compose v2）。先启动 Docker Desktop，终端进入本文件所在目录：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm local:setup
pnpm dev:local
```

随后打开 http://localhost:3000 。API 地址为 http://localhost:4000/api/v1 。

- `local:setup` 启动 PostgreSQL 和 MinIO，创建私有图片桶、应用数据库迁移并写入示例房源。
- 首次运行会从固定的官方源码编译 MinIO，可能需要几分钟。上游社区版本已归档且存在已知高危漏洞；本地存储仅限本机回环地址和受控示例数据。手机可在私有局域网浏览，完整图片上传或公开部署需配置仍受维护的私有 S3 兼容服务，详见操作文档。
- `dev:local` 同时运行前后端；保持终端开启，按 Ctrl+C 停止。
- 本地配置自动使用默认值；需要改前端地址时，将根目录 `.env.example` 复制为 `.env.local`。API 配置由 setup 在首次运行时从 `api/.env.example` 创建。
- 本地登录验证码显示在登录面板中。首次登录后按页面提示完善资料。
- 3000、4000、5432、9000 和 9001 端口需要可用。示例数据来自种子脚本；重新执行 setup 会更新种子记录，自己的测试记录不会被清库。
- setup 与 API 任务使用跨平台 Node 脚本，可在 Windows PowerShell 中执行以上命令；数据库集成测试在 Linux CI 中验证，也可通过 WSL2 / Docker 运行。
- 本地 Docker 默认仅允许本机访问；同一私有网络的手机演示设置见 `docs/demo-and-operations.md`。数据库管理界面默认关闭，需使用 `docker compose --profile admin up -d adminer` 明确开启。

## 仅用 Docker 运行本地开发环境

```bash
docker compose up -d
```

首次安装依赖需要一些时间。待 API 准备就绪后：

```bash
docker compose exec api pnpm -C api seed:marketplace
```

打开 http://localhost:3000 。用 `docker compose logs -f web api` 查看启动日志；用 `docker compose down` 停止。不要加 `-v`，该参数会删除本地数据库和图片卷。

## 验证与正式部署

本地依赖运行后，可执行 `pnpm release:check` 验证测试、构建及数据库/图片业务链路。完整检查会写入构建目录，应先停止 `pnpm dev:local`，检查完成后再启动。

正式部署的变量模板是根目录 `.env.production.example` 和 `api/.env.production.example`。填写成对应的 `.env.production` 文件，再运行：

```bash
pnpm production:check-config --compose --env-file .env.production
docker compose --env-file .env.production -f compose.production.yml up --build -d --wait
```

完整要求见 `docs/production-launch-checklist.md`，邮件、支付、地图和实时消息的接口约定见 `docs/external-integrations.md`。仍需自行提供正式 HTTPS 域名、数据库、对象存储、邮件和支付适配服务，以及 TLS Valkey；上线前验证真实服务。生产端口默认绑定 loopback，需通过 HTTPS 反向代理访问；网页构建变量 `NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN` 必须与图片上传地址的 origin 一致。

现有交付是响应式网页，可在手机和电脑浏览器中运行。Apple / Android 商店安装包及微信小程序属于后续独立交付；路径及备份、恢复、监控、回滚要求见 `docs/demo-and-operations.md`。

`--compose` 检查 Docker 最终解析到的配置，避免终端环境变量掩盖配置文件中的空值。服务端通过容器网络请求 API，浏览器通过公开 API 地址请求。

源码包不包含真实密钥、现有用户数据、已安装依赖或编译产物，也不代表已完成公网部署。9 月 30 日的修复、验证与剩余上线要求见 [安全审查](docs/security-review-2026-09-30.md)、[验证记录](docs/handoff-validation-2026-09-30.md) 和 [威胁模型](docs/sublet-pipeline-threat-model.md)。`output/handoff` 下的旧交接文件仅作历史参考；当前代码以本次分支为准。
