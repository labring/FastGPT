# T11：`skills`（Agent 技能包分发）与 OpenAPI 契约漂移 CI 门禁

- **所属需求包**：`PKG-07` AI Skill 与 Agent 技能（Record: `reczz28Yb8uAQaGY`）
- **细粒度 PRD（可按子 PRD 隔离文件并行认领）**：
  - `PRD-07.2`（`T11a`）`fastgpt skills` 5 套官方 Agent Skill 静态内嵌与安装（Record: `reczz28YDq8uWbOm` · `FR-703`）
  - `PRD-07.3`（`T11b`）Command Registry、Skill 引用与 OpenAPI 漂移 CI 门禁（Record: `reczz28Yb9VZyUjj` · `FR-704`）
- **阶段 / 优先级**：Phase 3 · P3（面向 AI Agent 协同能力放大与长期可维护性）
- **状态**：待前置 T00（[飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00，以及 T01 ~ T05 主力命令面稳定后编写对应 Skill 内容
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：架构与 `fastgpt skills` 框架可先行，Skill 文案内容随各域落地补齐

---

## 1. 目标

实现设计文档第 7 节的 **Agent 消费侧闭环**：
1. 内置并维护 5 个官方 FastGPT CLI Skill（与平台 `fastgpt skill` 区分，命令固定为复数 `fastgpt skills`），支持一键安装/更新到 Claude Code、Codex、Cursor 等本地目录。
2. 建立 **生成式清单与 OpenAPI 漂移检查脚本**，防止服务端 `packages/global/openapi` 变更或 CLI 命令增删后文档、Skill 与实际实现脱节。

---

## 2. 命令与功能设计

### 2.1 `fastgpt skills` 命令树（全本地操作，`authModes: ['none']`）

| 命令 | 风险 | 说明 |
|---|---|---|
| `skills catalog` | `read` | 列出内置 5 个官方 Skill 的名称、适用场景与涵盖命令 |
| `skills install [name...]` | `write` | 将 Skill 安装到 `--target <claude\|codex\|cursor\|agents>`（支持 `--scope project\|user`、`--dir <path>`、`--force`、`--dry-run`） |
| `skills uninstall <name...>` | `destructive` | 移除已安装的 FastGPT Skill 目录（需确认 / 非 TTY `--yes`） |
| `skills update` | `write` | 对比本地已安装 Skill 版本/checksum 与当前 CLI 版本并更新 |
| `skills doctor` | `read` | 检查当前项目/用户目录下已安装的 Skill 是否过期或存在缺失 |

### 2.2 配套 5 个 Skill 规划（内嵌于 `cli/skills/`，构建时打包）

1. **`fastgpt-cli`**：核心入口规范——认证排查（`doctor`/`whoami`/`login`）、非 TTY JSON 信封消费、退出码处理、`fastgpt api` 通用逃生口使用规范、安全与 `--dry-run` 护栏。
2. **`fastgpt-knowledge`**：`dataset` 全链路（建库、文件/链接导入、训练状态等待 `train wait`、检索召回调试）。
3. **`fastgpt-app`**：`app` 导出/导入、版本发布、发布渠道与日志/评测排查。
4. **`fastgpt-workflow`**：`workflow pull -> 本地 DSL 编辑/validate -> diff -> push/publish` 流程。
5. **`fastgpt-chat-eval`**：`chat run`、`chat history`/`record`、`app logs`、`app eval` 对话调试与回归分析。

### 2.3 OpenAPI / Registry 漂移检查（CI 门禁脚本）

在 `cli/scripts/` 新增校验脚本（并接入 `pnpm --filter @fastgpt/cli test:ci` 或独立 `check:drift`）：
1. **Command Registry 完整性检查**：
   - 遍历 `getCliCommandSpecs()`：检查 `path` 无重名、`aliases` 无冲突、`summary`/`examples` 非空、`risk` 与 `authModes` 合法。
   - 检查 `skill` 与 `skills` 之间无同名子命令歧义。
2. **Skill 清单同步检查**：
   - Skill 文档中引用到的 `fastgpt <cmd>` 子命令，必须存在于 `commands --format json` 注册表中，否则 CI 失败（防止重构命令名后 Skill 过时教唆 Agent 敲错命令）。
3. **双构建产物体积与可执行检查**：
   - 验证 `tsdown` 产物（`dist/cli.mjs`）不包含意外打入的 `cli/skills` 冗余大文件或前端 UI 包；单文件 `bun build --compile` 产物可执行 `skills catalog --format json`。

---

## 3. 核心实现要点与限制

- **Skill 资源在 `tsdown` 与 `bun compile` 下的同源加载（关键）**：
  - 注意 `bun build --compile` 生成单二进制文件时，散落磁盘的相对路径 `../skills/*.md` 可能在二进制内找不到！
  - **推荐做法**：由构建前或 TS 模块以静态 `import`（或构建脚本生成 `src/domain/skills/embedded-skills.ts` 纯字符串常量映射）内嵌 Skill 内容，确保无论是 `npx @fastgpt/cli` 还是 89MB 单文件二进制，都能 0 路径问题安装 Skill！
- **目录与文件落点**：
  - `cli/skills/<skill-name>/SKILL.md`
  - `src/domain/skills/skills-service.ts`
  - `src/infra/fs/skill-installer.ts`
  - `src/cli/commands/skills.ts`
  - `cli/scripts/check-command-drift.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`skills catalog`、`skills install --dry-run`、安装到临时目录的 `SKILL.md` 写入与覆盖保护、`skills uninstall` 非 TTY `--yes` 门禁。
- [ ] 单测/脚本验证：所有 Skill 引用命令均在 `getCliCommandSpecs()` 中真实存在。
- [ ] 在单文件编译产物 `./cli/bin/fastgpt skills catalog --format json` 实测通过（确认内嵌静态资源不依赖源码目录磁盘路径）。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
