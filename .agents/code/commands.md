# FastGPT 开发命令

本文档记录本仓库常用开发命令。执行前请确认位于仓库根目录 `/Volumes/code/FastGPT`，并使用 `pnpm` workspace 环境。

## 项目专用命令

### 主应用（`projects/app/`）

- `cd projects/app && pnpm dev` - 启动 NextJS 开发服务器
- `cd projects/app && pnpm build` - 构建 NextJS 应用
- `cd projects/app && pnpm start` - 启动生产服务器

### 代码沙箱（`projects/code-sandbox/`）

- `cd projects/code-sandbox && pnpm dev` - 以监视模式启动（Bun）
- `cd projects/code-sandbox && pnpm build` - 构建沙箱服务
- `cd projects/code-sandbox && pnpm test` - 运行 Vitest 测试

### MCP 服务器（`projects/mcp_server/`）

- `cd projects/mcp_server && bun dev` - 使用 Bun 以监视模式启动
- `cd projects/mcp_server && bun build` - 构建 MCP 服务器
- `cd projects/mcp_server && bun start` - 启动 MCP 服务器

## 工具命令

- `pnpm lint` - 对所有 TypeScript 文件运行 ESLint 并自动修复
- `pnpm test` - 顺序运行所有 workspace 单元测试，然后运行仓库根目录测试
- `pnpm test <file-path...>` - 顺序运行指定测试，关闭覆盖率并限制为单 worker
- `FASTGPT_TEST_SCOPE=app pnpm test` - 只运行指定 workspace；支持逗号分隔多个 scope，以及 `workspace`、`repo`
- `FASTGPT_TEST_MODE=integration pnpm test` - 运行 service 集成测试；`sandbox` 运行沙箱集成测试，`all` 运行 workspace 单测和 service 集成测试
- `pnpm initIcon` - 初始化图标资源
- `pnpm gen:theme-typings` - 生成 Chakra UI 主题类型定义
