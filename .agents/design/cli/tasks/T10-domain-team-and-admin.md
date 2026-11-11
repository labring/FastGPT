# T10：`team`（团队、API Key、账单）与 `admin`（系统管理员隔离域）

- **所属需求包**：`PKG-06` 团队治理、管理后台与 Agent 赋能（Record: `reczz28YGuG6RmrU`）
- **覆盖 FR**：`FR-601` 团队治理与账单用量、`FR-602` `team apikey` 自助管理与脱敏、`FR-603` `admin` 高危隔离域
- **阶段 / 优先级**：Phase 3 · P3
- **状态**：待前置 T00（PRD Record: `reczz28YDq8uXEJb` · [飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（需要确认门禁、`--dry-run`、脱敏输出、分页列表）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T06 ~ T09、T11 并行

---

## 1. 目标

补齐**团队协作与凭据自助管理**（`team` 域，包括在 CLI 里直接增删/轮换 API Key、查看团队用量与成员），并将平台**管理员后台能力**（`admin` 域）收口在独立的隔离命名空间中，同时标注风险级别与脱敏规则。

---

## 2. 命令设计与接口映射

### 2.1 `team` 域

> 大多数团队治理、成员部门与钱包账单接口属于 `/proApi/**` 且仅限 `token` 凭据；开源版若缺失对应接口需友好报错提示。

| 分组 | 命令 | 对应服务端接口 | 风险 | 典型 `authModes` |
|---|---|---|---|---|
| **团队基础** | `team list` | `/proApi/support/user/team/list` | `read` | `['token']` |
| | `team switch <teamId>` | `/proApi/support/user/team/switch`（复用/对齐 `auth switch-team`） | `write` | `['token']` |
| | `team plan` | `/support/user/team/plan/getTeamPlanStatus`（及 Pro `getTeamPlans`） | `read` | `['token']` |
| **成员/组织** | `team member list` | `/proApi/support/user/team/member/list` | `read` | `['token']` |
| | `team org list` | `/proApi/support/user/team/org/list` | `read` | `['token']` |
| | `team group list` | `/proApi/support/user/team/group/list` | `read` | `['token']` |
| **API Key 管理** | `team apikey list` | `/support/openapi/list` | `read` | `['token']`（核对路由） |
| | `team apikey create` | `/support/openapi/create` | `write` | `['token']` |
| | `team apikey update <id>` | `/support/openapi/update` | `write` | `['token']` |
| | `team apikey delete <id>` | `/support/openapi/delete` | `destructive` | `['token']` |
| **用量与账单** | `team usage list` | `/support/wallet/usage/getUsage` | `read` | `['token']` |
| | `team usage dashboard` | `/support/wallet/usage/getDashboardData` | `read` | `['token']` |
| | `team bill list` | `/proApi/support/wallet/bill/list` | `read` | `['token']` |

### 2.2 `admin` 隔离域（仅管理员 / Root）

> `packages/global/openapi/admin/**` 下有大量系统运营接口，**不要全部硬编码包装成几十个命令**；仅封装高频运维排障命令，其余通过 `fastgpt api` 访问。

- 建议首批高频管理员命令（全部声明 **`risk: 'admin'`** 与 **`authModes: ['token']`**）：
  - `admin users list`（`/proApi/admin/user/list` 或核对 `openapi/admin/user` 实际路径）
  - `admin teams list`（核对 `openapi/admin/team` 实际路径）
  - `admin apps list`（`/proApi/admin/app/getApps`）
  - `admin datasets list`（`/proApi/admin/dataset/getDatasets`）
  - `admin audit list`（核对 `openapi/admin/system/audit`）
  - `admin license status`（核对 `openapi/admin/license`）

---

## 3. 核心实现要点与安全红线

1. **`team apikey create` 密钥保护**：创建 API Key 时服务端会一次性返回完整明文 Key。注意 CLI `renderer.ts` 对 `apiKey` 等字段会自动脱敏！**必须针对 `team apikey create` 的显式一次性展示做精确设计**：
   - 默认文本模式可提示并写入剪贴板或仅在显式 `--reveal` 时打印一次完整 Key，同时 stderr 提醒立即保存到 `fastgpt login --api-key-stdin`；绝不在 debug 日志、错误堆栈或 history 中落盘明文 Key！
2. **`admin` 域本地角色门禁预检**：若本地 Profile 缓存 `isRoot === false`（且未传 `--token` 临时覆盖），在 `admin` 命令执行前可直接给出明确预警或交由服务端校验，但绝不能将 `admin` 暴露给默认 `mcp serve`（已在 `T08` 强制排除）。
3. **目录落点**：
   - `src/domain/team/*.ts`、`src/cli/commands/team/*.ts`
   - `src/domain/admin/*.ts`、`src/cli/commands/admin/*.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`team apikey list/create/delete`、`team list/plan`、`admin` 域 `risk: 'admin'` 标记与 `personalKey`/`appKey` 拦截（退出码 `3`）。
- [ ] 单测覆盖：开源版服务端返回 404 时 `/proApi/**` 命令报错提示友好且不泄露敏感字段。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
