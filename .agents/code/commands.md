# FastGPT 开发命令

以下命令在仓库根目录执行。Node.js 和 pnpm 版本见 [package.json](../../package.json)。

## 开发与构建

| 项目 | 启动开发服务 | 构建 | 运行服务 |
| --- | --- | --- | --- |
| 主应用（Next.js） | `pnpm dev` | `pnpm --dir projects/app build` | `pnpm --dir projects/app start` |
| 代码沙箱（Node.js + Hono） | `pnpm --dir projects/code-sandbox dev` | `pnpm --dir projects/code-sandbox build` | `pnpm --dir projects/code-sandbox start` |
| MCP 服务（Bun） | `pnpm --dir projects/mcp_server dev` | `pnpm --dir projects/mcp_server build` | `pnpm --dir projects/mcp_server start` |

## 测试

局部验证用 `pnpm test <测试文件或目录> [...]`。运行器按所属 Vitest 配置分组串行执行，默认关闭覆盖率、使用单 worker。按用例名筛选时，用 `--` 将 Vitest 参数与路径分开。

```sh
pnpm test packages/global/test/common/error/s3.test.ts -- -t 'raw string EntityTooLarge'
```

使用公共 [Mongo 测试初始化](../../test/globalSetup.ts)的套件会读取 `FASTGPT_TEST_MONGODB_URI`。需要复用已有数据库时，运行前将它设为专用测试副本集的 URI。省略时会在本机启动临时副本集。

| 命令 | 执行范围 |
| --- | --- |
| `pnpm test` | [运行器](../../scripts/test/run.mjs)列出的 workspace 单测，再运行根 `test/` 下的仓库级测试 |
| `FASTGPT_TEST_SCOPE=app,service pnpm test` | 只跑所选单测。支持逗号分隔。`workspace` 选取运行器列出的 workspace，`repo` 单独选取仓库级测试 |
| `FASTGPT_TEST_MODE=integration pnpm test` | service 常规集成测试 |
| `FASTGPT_TEST_MODE=sandbox pnpm test` | service 的沙箱集成测试 |
| `FASTGPT_TEST_MODE=all pnpm test` | 运行器列出的 workspace 单测与 service 常规集成测试。仓库级测试和沙箱集成测试需分别选择 |

指定路径时不能同时设置 `FASTGPT_TEST_MODE` 或 `FASTGPT_TEST_SCOPE`。独立项目也有自己的测试入口，例如 `pnpm --dir projects/code-sandbox test`。

## 工具命令

- `pnpm lint` 通过 Turbo 执行各 workspace 已声明的 lint 脚本。
- `pnpm initIcon` 更新图标资源，`pnpm gen:theme-typings` 生成 Chakra UI 主题类型。
- 新增语言或翻译命名空间后，用 `pnpm generate:i18n-loaders` 更新加载器，`pnpm check:i18n-loaders` 验证生成结果。
