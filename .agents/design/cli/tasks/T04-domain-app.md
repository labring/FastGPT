# T04：`app` 应用生命周期、版本、发布渠道、日志与评测域

- **所属需求包**：`PKG-03` 应用管理（App）（Record: `reczz28YGuG6R28N`）
- **细粒度 PRD（可按子 PRD 隔离文件并行认领）**：
  - `PRD-03.1`（`T03a`）应用基础生命周期与导入导出（Record: `reczz28YDq8uSoiE` · `FR-301`~`FR-302`）
  - `PRD-03.2`（`T03b`）应用版本发布与分享渠道（Record: `reczz28Yb9VZvO3d` · `FR-303`~`FR-304`）
  - `PRD-03.3`（`T03c`）应用运行日志与评测管理（Record: `reczz28Yb9VZvwlh` · `FR-305`~`FR-306`）
- **阶段 / 优先级**：Phase 1 · P1（高频主力域）
- **状态**：待前置 T00（[飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（需要文件下载、JSON 文件入参、`--dry-run`、破坏性确认）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T01 ~ T03、T05 ~ T10 完全并行

---

## 1. 目标

实现 FastGPT 应用的全生命周期 CLI 管理：应用列表/详情/创建/更新/复制/删除、本地 JSON 导出导入、版本发布与回滚、分享与发布渠道管理、应用运行日志查询与导出、应用评测查询与触发。

---

## 2. 命令设计与接口映射

> 注意：`app` 大多数管理写接口（`detail`/`create`/`update`/`del`/`copy`/`version/publish`）**仅允许 `token`（Session）**，而 `list` 与 `logs` 部分支持 `personalKey` / `appKey`，务必在实现前逐个核对 `projects/app/src/pages/api/core/app/**`！

| 分组 | 命令 | 对应服务端接口 | 风险 | 典型 `authModes` |
|---|---|---|---|---|
| **基础** | `app list` | `/core/app/listV2`（兼容 `/core/app/list`） | `read` | `['token', 'personalKey']` |
| | `app get <appId>` | `/core/app/detail` | `read` | `['token']`（核对 `getBasicInfo`） |
| | `app create` | `/core/app/create` | `write` | `['token']` |
| | `app update <appId>` | `/core/app/update` | `write` | `['token']` |
| | `app copy <appId>` | `/core/app/copy` | `write` | `['token']` |
| | `app pin <appId>` | `/core/app/pin` | `write` | `['token']` |
| | `app delete <appId>` | `/core/app/del` | `destructive` | `['token']` |
| | `app folder create` | `/core/app/folder/create` | `write` | `['token']` |
| **导出导入** | `app export <appId>` | **客户端编排**：`GET /core/app/detail`（或 `version/detail`）抽取出可导入 JSON 写入 `--output` | `read` | `['token']` |
| | `app import <file>` | **客户端编排**：调 `/core/app/create`（可选 `--publish` 再调 `/core/app/version/publish`） | `write` | `['token']` |
| **版本** | `app version list <appId>` | `/core/app/version/list` | `read` | `['token']` |
| | `app version get <appId> <versionId>` | `/core/app/version/detail` / `latest` | `read` | `['token']` |
| | `app version publish <appId>` | `/core/app/version/publish` | `write` | `['token']` |
| | `app version update <appId> <versionId>` | `/core/app/version/update` | `write` | `['token']` |
| **渠道** | `app channel list <appId>` | `/support/outLink/list` | `read` | `['token']` |
| | `app channel create <appId>` | `/support/outLink/create` | `write` | `['token']` |
| | `app channel update <linkId>` | `/support/outLink/update` | `write` | `['token']` |
| | `app channel delete <linkId>` | `/support/outLink/delete` | `destructive` | `['token']` |
| **日志** | `app logs list <appId>` | `/core/app/logs/list` | `read` | `['token', 'personalKey', 'appKey']` |
| | `app logs export <appId>` | `/core/app/logs/exportLogs` | `read` | 核对路由 |
| | `app logs users <appId>` | `/core/app/logs/getUsers` | `read` | 核对路由 |
| | `app logs stats <appId>` | `/proApi/core/app/logs/getTotalData` / `getChartData` | `read` | 核对路由（Pro） |
| **评测** | `app eval list <appId>` | `/proApi/core/app/evaluation/list` | `read` | `['token']`（Pro） |
| | `app eval items <evalId>` | `/proApi/core/app/evaluation/listItems` | `read` | `['token']`（Pro） |
| | `app eval export <evalId>` | `/proApi/core/app/evaluation/exportItems` | `read` | `['token']`（Pro） |
| | `app eval retry <evalItemId>` | `/proApi/core/app/evaluation/retryItem` | `write` | `['token']`（Pro） |

---

## 3. 核心实现要点与限制

### 3.1 `app export` / `app import` 客户端编排说明（关键）
- FastGPT 服务端**没有**单独的 `/core/app/export` 接口；网页端导出实际上是由前端读取 `/core/app/detail`（或版本详情）并剥离租户特有字段（如 `teamId`、`tmbId`、`permission`、`_id`）后保存为 JSON。
- CLI 必须提取一个纯转换函数（在 `src/domain/app/app-export-mapper.ts`），清晰剔除不可迁移字段；`app import` 通过 `--dry-run` 可预览将创建的 App 结构与版本配置。

### 3.2 `app logs` 的 `appKey` 兼容
- `app logs list` 后端明确支持 `authAppApiKey: true`；当用户使用 `appKey` 且未显式传 `<appId>` 时，同样自动从 `resolvedAuth.credential.boundAppId` 补全（和 `T03` 保持一致体验）。

### 3.3 开源版 vs Pro 版接口降级
- `app eval` 与 `app logs stats` 属于 `/proApi/*`，在开源版服务端返回 404 时需抛出语义清晰的 `CliApiError`（提示该能力仅商业版可用），而不是打印原始 HTML 404 页面。

### 3.4 目录落点
- `src/domain/app/app-service.ts`
- `src/domain/app/app-export-mapper.ts`
- `src/domain/app/version-service.ts`
- `src/domain/app/channel-service.ts`
- `src/domain/app/logs-eval-service.ts`
- `src/cli/commands/app/*.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`app detail`/`app version publish` 用 `personalKey` 时在本地门禁直接返回退出码 `3`。
- [ ] 单测覆盖：`app logs list` 使用 `appKey` 自动绑定 `boundAppId` 查询成功。
- [ ] 单测覆盖：`app export` 剥离敏感/实例绑定字段（`teamId`/`tmbId`/`_id`），`app import` 支持 `--dry-run` 与 `--publish`。
- [ ] 单测覆盖：`app delete` 与 `app channel delete` 在非 TTY 无 `--yes` 时返回退出码 `2`。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
