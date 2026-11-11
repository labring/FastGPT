# T09：`skill` 平台 AI Skill 与沙盒调试域

- **所属需求包**：`PKG-05` MCP 全向集成与平台 AI Skill（Record: `reczz28YGuG6QeIn`）
- **覆盖 FR**：`FR-504` `skill` 平台 AI Skill 管理、沙盒运行态调试与版本切换（含消歧护栏）
- **阶段 / 优先级**：Phase 2 · P2
- **状态**：待前置 T00（PRD Record: `reczz28YDq8ua7KK` · [飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（需要 SSE 流式处理、文件导入导出、`--dry-run`、确认门禁）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T06 ~ T08、T10 并行

---

## 1. 目标

实现 FastGPT 平台一等资源 **AI Skill**（`packages/global/openapi/core/ai/skill/`）的 CLI 管理与调试能力，并严格与本地 Agent 技能包命令 `fastgpt skills`（T11）做好命名防误触提示。

---

## 2. 命令设计与接口映射

> 注意：`projects/app/src/pages/api/core/ai/skill/**` 部分接口（如 `detail`）支持 `authApiKey: true`，其余创建/编辑/调试/版本接口多为 `token` 或分 Pro/OSS 版本，编码前务必逐路由核对！

| 命令 | 对应服务端接口 | 风险 | 说明 |
|---|---|---|---|
| `skill list` | `/core/ai/skill/listV2` | `read` | 分页或按 `--ids` 查询当前团队可见技能 |
| `skill get <skillId>` | `/core/ai/skill/detail` | `read` | 获取技能详情与沙盒状态（`['token', 'personalKey']`） |
| `skill create` | `/core/ai/skill/create` | `write` | 创建技能并初始化空白 skills 工作区 |
| `skill update <skillId>` | `/core/ai/skill/update` | `write` | 更新名称/简介/分类/配置（支持 `--dry-run`） |
| `skill copy <skillId>` | `/core/ai/skill/copy` | `write` | 复制技能 |
| `skill delete <skillId>` | `/core/ai/skill/delete` | `destructive` | 删除技能（需确认 / 非 TTY `--yes`） |
| `skill export <skillId>` | `/core/ai/skill/export` | `read` | 导出技能包到 `--output <file>` |
| `skill import <file>` | `/core/ai/skill/import` | `write` | 上传导入技能包 |
| `skill deploy <skillId>` | `/core/ai/skill/save-deploy` | `write` | 保存并部署技能 |
| `skill debug <skillId> [msg]` | `/core/ai/skill/debugChat`（或 Pro 版） | `write` | 沙盒对话调试（复用 `T00` SSE 流式渲染） |
| `skill runtime status <skillId>` | `/core/ai/skill/runtime/getStatus` | `read` | 查询沙盒运行容器状态 |
| `skill runtime init <skillId>` | `/core/ai/skill/runtime/init` | `write` | 初始化/拉起沙盒环境 |
| `skill runtime upgrade <skillId>` | `/core/ai/skill/runtime/upgrade` | `write` | 升级沙盒运行时 |
| `skill version list <skillId>` | `/core/ai/skill/version/list` | `read` | 列出技能历史版本 |
| `skill version update <skillId>` | `/core/ai/skill/version/update` | `write` | 更新版本说明 |
| `skill version switch <skillId>` | `/core/ai/skill/version/switch` | `write` | 切换生效版本 |

---

## 3. 命名防误触护栏（关键约定）

为了避免使用者将平台 `fastgpt skill` 与本地 Agent 技能安装命令 `fastgpt skills`（T11）混淆：
1. 在 `GROUP_DESCRIPTIONS.skill` 明确标注：`Manage FastGPT platform AI Skills (for CLI agent skills, use "fastgpt skills")`。
2. 在 `cli/commands/skill/` 中（或 Commander 子命令未知钩子）针对常见误输入动词（`install`、`uninstall`、`catalog`），主动给出纠正提示：`Did you mean "fastgpt skills <action>" for local agent skill packages?`
3. 目录落点：
   - `src/domain/skill/platform-skill-service.ts`
   - `src/cli/commands/skill/*.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`skill list/get/create/export/import/deploy/debug/version` 及 `skill delete` 非 TTY `--yes` 门禁。
- [ ] 单测覆盖：`skill` 与 `skills` 帮助描述互指及错用 `skill install` 时的提示验证。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
