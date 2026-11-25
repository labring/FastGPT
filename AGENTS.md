# FastGPT 仓库协作指南

FastGPT 是使用 pnpm workspaces 的 AI Agent 构建平台。开发环境按根 [package.json](./package.json) 的 `engines.node` 和 `packageManager` 配置。启动、构建和测试入口见[开发命令](./.agents/code/commands.md)。

## 代码放在哪里

| 改动 | 位置 |
| --- | --- |
| 主应用页面、API 与应用侧服务 | `projects/app/src/`，其中 Next.js API 路由在 `pages/api/`，业务页面组件在 `pageComponents/` |
| 共享业务类型与 API 合约 | `packages/global/`，接口专用 Schema 和 OpenAPI Path 在 `packages/global/openapi/` |
| 服务端业务、MongoDB 模型、向量库与工作流执行 | `packages/service/`。Redis 数据访问在 `packages/dal/`，工作流定义与编辑工具在 `packages/workflow-core/` |
| 共享 UI 与翻译 | `packages/web/`。语言资源在 `i18n/`，支持的语言以 [LocaleList](./packages/global/common/i18n/type.ts) 为准 |
| CLI、SDK 与独立服务 | 官方 CLI 在 `cli/`，SDK 在 `sdk/`。代码沙箱在 `projects/code-sandbox/`，MCP 服务在 `projects/mcp_server/`，插件市场在 `projects/marketplace/`。外部插件见 [FastGPT-plugin](https://github.com/labring/fastgpt-plugin) |
| 商业版、产品文档与部署 | `pro/` 是 Git 子模块，文档站在 `document/`，Compose 模板、生成脚本和 Kubernetes 清单在 [deploy/](./deploy/) |

## 开发约定

- 改代码或测试前先读[代码规范](./.agents/code/syntax.md)，核对调用方和已有[设计](./.agents/design/)。现有实现与规范冲突时优先按规范执行，因业务或兼容性需要例外时说明原因。
- **控制颗粒度与编码前契约**：单次变更聚焦单一目标；跨层大型需求优先按「底层契约/DAL → 核心业务与迁移 → UI/SDK/文档」拆分提交，不混入无关修复。编码前先明确权威状态源与 DAL 边界、已发布版本存量与 `pro` 滚动兼容窗口，以及异步并发/取消/失败回滚闭环（见[状态闭环与兼容边界](./.agents/code/syntax.md#状态闭环与兼容边界)）。
- 对导出函数、核心业务函数、hook 和复杂工具优先用 `/** ... */` 说明职责和输入输出。在计费、权限、并发、重试等容易误解的分支旁用中文解释原因。
- 单一调用方的 helper 优先放在调用函数内部。跨函数复用、需独立导出测试或属于模块公共能力时放到模块级，并说明职责和边界。
- **修复问题（含 review 意见）**按[根因修复规范](./.agents/code/root-cause-fix.md)执行：先写清根因和不变量，在归属层修正并一次性扫清读/写/导入/导出/`pro` 等对称入口，调整或裁剪方案时同步清理死代码与多余契约，不为关闭单条意见打补丁。
- 先用代码和调用方核实假设。影响行为的需求歧义或破坏性操作需向用户确认。**修改任何部署相关的 `.yml` 或 `.yaml` 文件前，必须获得用户明确确认。**

## 按改动查规范

- **API 路由**按 [API 开发规范](./.agents/skills/system/api-development/SKILL.md) 同步合约与 OpenAPI。外部请求的 body、query、params 用 `parseApiInput` 校验。普通业务响应、数据库记录和模型输出用对应的 `Schema.parse`。无入参或无业务返回值时省略相应的占位 Schema。错误分类见[请求入参错误设计](./.agents/design/api/zod-request-parse-error-handling.md)。
- **历史兼容、跨仓与升级**：修改持久化结构、配置默认值、公开 API/SDK 或跨主仓/`pro` 共享能力时，核对已发布版本存量数据、滚动升级/回滚窗口及 `pro` 调用方兼容；涉及 Zod 枚举或判别联合变更时按[历史兼容规范](./.agents/code/syntax.md#zod-枚举变更与历史兼容)处理，新增或修改自动升级任务时遵循[系统迁移规范](./.agents/skills/system/system-migration-development/SKILL.md)。
- **跨实例调用**按[分层架构](./.agents/code/syntax.md#分层架构)组织：实例业务层不引入其他实例，所需能力由上层以函数参数注入。
- **CI** 修改 GitHub Actions workflow 时按[双轨同步规则](./.agents/skills/system/ci-workflow-sync/SKILL.md)核对 Forgejo 对应项。

### 数据库与索引规范

- **新建/迁移 DAL 集合与表**：MongoDB 集合统一使用 `@fastgpt/dal/db/mongo/collection` 的 `defineMongoCollection`（接收原生 `Schema` 与 `indexes`），OceanBase 表在 `oceanbase/table.ts` 声明行类型与原生 `CREATE TABLE IF NOT EXISTS ... DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;` DDL；未迁出的存量旧 Schema 仍使用 `defineIndex`。禁止直接调用 `schema.index()` 或使用字段级 `index: true`、`unique: true` 隐式建索引。
- **命名与零墓碑原则**：所有 OceanBase 托管索引与所有**新增** Mongo 索引统一命名为 `fg_<table_short>_<purpose>[_vN]`（<= 63 ASCII 字节）；存量未带前缀的 Mongo 索引原地冻结不强改名；严禁在 `schema.ts` 中新增 `deprecated: true` 永久墓碑。
- **Expand-Contract 删除与属性变更**：启动期 Mongo 同步仅做异步只增补建，绝不自动删除索引；删除索引遵循两版本收缩（N 版移除声明与查询依赖，N+1 版在 `projects/app/src/migration/tasks/<version>/<YYYYMMDD>_cleanup_mongo_indexes/` 新增统一清理迁移任务，复用 `createMongoIndexCleanupMigration` / `dropManagedMongoIndexIfExists` 按名/键/选项精确清理并遵循 `MONGO_DEPRECATE_INDEX`），保留客户 DBA 自建与来源不明索引。详见[多库仓储架构](./.agents/design/common/dal/multi-db-repository-architecture.md)与[索引同步设计](./.agents/design/common/mongo-index-sync-strategy.md)。

## 测试

- 开发与提交前运行覆盖改动及受影响行为的测试，根目录执行 `pnpm test <测试文件或目录>`；修改 `packages/*` 导出签名、DAL 子路径或共享契约时，同步运行受影响应用的 `typecheck` 并核对 `pro` 引用。用户完成最终验收后才运行完整测试。
- 使用公共 Mongo 初始化的套件默认在本机启动临时副本集。要复用专用测试副本集，在运行前设置 `FASTGPT_TEST_MONGODB_URI`。
- 单测优先放在所属 workspace 的 `test/`，根 `test/` 存放仓库级测试和共享初始化。编写单测见[单测规范](./.agents/skills/system/test-case/SKILL.md)。业务验收用例在 [.agents/test/](./.agents/test/)，按[用例编写](./.agents/skills/system/fastgpt-integration-test-case/SKILL.md)和[执行规则](./.agents/skills/system/fastgpt-integration-test-runner/SKILL.md)维护。

## 文档输出

设计与待办放在 [.agents/design/](./.agents/design/)，待办附在对应设计后。问题分析放在 [.agents/issue/](./.agents/issue/)。同一需求优先维护一份 UTF-8 文档，内容较多时按目录归档。仅在用户要求时编写总结报告。
