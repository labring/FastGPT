# 内容审查插件接入 FastGPT — 实施计划

mode: plan
task: FastGPT 接入 fastgpt-plugin 的 `moderation` 插件类型
ui_design: https://www.figma.com/design/KcAmeVQkIsXRuR9CsFTa1N/%E8%B4%A6%E5%8F%B7?node-id=2743-1139&p=f&m=dev (内容审核插件，node-id: 2743-1139)
complexity: complex
status: P1 完成（管理侧后端与管理端 UI 均已打通并验证通过，待进入 P2 调用锚点设计）

> 说明：skill 默认把计划写到 `tasks/plan.md` + `tasks/todo.md`；本仓库 AGENTS.md 规定设计文档放在 `.agents/design`，todo 跟在设计文档后面，因此计划与 todo 合并在本文件。

## 1. 概述

plugin 侧已交付内容审查插件类型（生命周期 + 调用接口）。FastGPT 侧分四个阶段接入：

| 阶段 | 内容 | 本计划是否展开 |
| --- | --- | --- |
| P1 | 管理侧接入：安装插件、插件配置、测试调用 | 是（详细任务） |
| P2 | 调用锚点设计（哪些环节、何时、用哪个插件审查，以及 `suspected` / `error` 的处理策略） | 否，需先出设计 |
| P3 | 多视角审查结果展示（逐项 `hits`、provider 原文标签、置信度） | 否，依赖 P2 |
| P4 | Marketplace 改造（支持 `type: moderation` 的市场条目与安装） | 否，独立计划 |

## 2. 现状调研结论

### plugin 侧（fastgpt-plugin）

- 接口：`GET /moderation`（详情）、`POST /moderation/check`（同步文本审查，直接返回 `ModerationResult`）；`GET /plugins?types=moderation` 可发现插件。
- `ModerationResult`：`verdict` 四档（`pass | block | suspected | error`）+ `hits[]`（`label` / `providerLabel` / `score` / `keywords`）+ `provider` + `errorMessage`。是否放行完全由 FastGPT 决定。
- 配置面只有 `secretSchema`（扁平一层），调用时通过请求体 `secrets` 传入；严格度由厂商控制台策略 ID 表达，框架不归一化。
- `sdk/client` 已是 `2.0.0`，提供 `getModeration` / `checkModeration`；`2.0.0` 含 `Tool*` → `Plugin*` 类型改名（breaking）。
- 框架级失败（插件不存在、进程崩溃）走 HTTP 400/404；provider 无法判定走 `verdict: 'error'` 的正常结果。两者在 FastGPT 侧必须区分。

### FastGPT 侧

- `packages/global` 依赖 `@fastgpt-plugin/sdk-client` 为 `1.1.0`，全仓库没有任何 moderation 代码。
- 已有旧审查链路：`global.textCensorHandler` → `postCheckCensor`（pro 的 `/common/censor/check`，内部走百度或自定义 URL）；调用点是 `dispatchChatCompletion` 与 `toolcall`，由模型配置 `config.censor` 控制；`postTextCensor` 只在返回 code 5000 时拒绝，其余错误一律放行（fail-open）。
- 管理侧已有可复用设施：`authSystemAdmin`、admin 的 `installWithUrl` / `pkg/upload` / `pkg/confirm`、`runtimeConfig` 接口、`AdminContainer` 的「系统资源」菜单、系统工具 secrets 的加密与脱敏（`systemTool/secrets.ts`）、`jsonSchema2SecretInput`。
- `team_installed_plugins.pluginType` 与 Marketplace schema 的 `type` 目前都是 `z.literal('tool')`（P4 才处理）。
- `systemTool.repo` 通过 `pluginClient.listTools` 取工具列表。需要确认 plugin 侧 `listTools` 不会返回 moderation 插件，否则会泄漏到工具模板和工作流节点。

## 3. 关键决策（需要你确认）

1. **配置存储位置**：建议新建独立集合（如 `system_moderation_plugins`：`pluginId`、`source`、`version`、`enabled`、加密后的 `secretsVal`），不复用 `MongoSystemTool`。原因是审查插件不是工具，不进工具列表、不进工作流节点，状态与计费字段也不同。secrets 的加密与脱敏复用 `systemTool/secrets.ts` 的实现。
2. **启用模型**：同一时间只启用一个审查插件，还是允许多个同时启用？P3 提到「多视角」，可能指多个 provider 并行审查。这会决定 schema 和 P2 的调用接口。**建议 P1 的数据模型按「可多个 enabled」设计**，UI 先不限制。
3. **与旧 censor 的关系**：P1 不改旧链路，两者并存；谁替代谁、是否迁移 `config.censor`，放到 P2 设计里决定。
4. **admin 页面的 License 白名单**：开源版 License 未激活时只展示白名单菜单（`unlicensedAdminRoutes`）。审查插件页面是否属于开源可用能力？
5. **SDK 升级**：`sdk-client` 从 `1.1.0` 升到 `2.0.0` 会有类型改名，需先 grep `Tool*` 类型的使用面，并确认 `2.0.0` 已发布到可安装的源。

## 4. 依赖关系

```
T1 升级 sdk-client
 └─ T2 global 类型 + 请求/响应 schema
     ├─ T3 service：schema / entity / service
     │   └─ T4 admin API：list / detail / config
     │       └─ T5 admin API：test check
     └─ T6 安装链路兼容（upload / confirm / installWithUrl）
         └─ T7 admin 页面（列表 + 安装）
             ├─ T8 配置抽屉
             └─ T9 测试调用弹窗
```

## 5. 任务清单（P1：管理侧接入）

### Phase 0：基础

- [x] **T1 升级 `@fastgpt-plugin/sdk-client` 到 2.0.0（S）** — DONE
  - 验收：`packages/global/package.json` 依赖升级；所有 `Tool*` 旧类型引用改为新名；`packages/global/sdk/fastgpt-plugin.ts` 的 re-export 不引入 moderation 以外的新行为。
  - 验证：根目录 typecheck 通过；`pnpm test packages/service/test/core/app` 中与 plugin client 相关的用例通过。
  - 依赖：无。风险：`2.0.0` 是否已发布。
  - 文件：`packages/global/package.json`、`pnpm-lock.yaml`、受 breaking 影响的调用点。
  - **实施记录**：
    - 采用本地 link（不是 npm 安装）：`packages/global/package.json` 中 `@fastgpt-plugin/sdk-client` 指向 fastgpt-plugin 仓库的 `sdk/client` 绝对路径。**该绝对路径不能提交**，正式发布后改回版本号。
    - breaking 改名只影响 1 个文件：`packages/service/thirdProvider/fastgptPlugin/index.ts`——`ToolAnswerType` → `PluginStreamAnswerType`、`ToolHandlerReturnType` → `PluginStreamResponseDataType`。
    - **zod 版本必须两边一致**：zod 4.x 不同 minor 的内部 `_zod.version` 互不兼容，跨包 zod 实例会报 `Type '3' is not assignable to type '1'`。已把 fastgpt-plugin 的 zod 统一到 **4.1.12**（与 FastGPT catalog 一致）：`pnpm-workspace.yaml` catalog `^4` → `4.1.12`，并让 `sdk/client`、`packages/domain`、`apps/server`、`apps/cli` 改用 `catalog:`。**该改动在 fastgpt-plugin 仓库，需随 sdk-client 一起提交。**
    - 顺带修了 `packages/global/core/app/tool/systemTool/codec.ts` 的既有类型错误：`attachToolConfig` 不再直接读 `global.feConfigs.systemTitle`（global 包是前后端共享的纯类型包，tsconfig 不含 service 的全局声明），改成参数 `systemTitle`，由 `systemTool.repo.ts` 两个调用点传入。
  - **验证结果**：`packages/global`、`packages/service`、`packages/dal`、`projects/app` typecheck 均 0 错误；`packages/web` 54 个错误经 stash 对比确认为既有问题（scss 声明 / React 类型 / i18n 测试），与本次无关；`pnpm test packages/service/test/core/app` → 20 文件 / 286 用例通过；`pnpm test packages/global/test/core/app` → 21 文件 / 483 用例通过。

- [x] **T2 global 类型与 OpenAPI schema（S）** — DONE
  - 验收：新增 `packages/global/core/plugin/moderation/type.ts`（配置记录类型）；`packages/global/openapi/core/plugin/admin/moderation/api.ts` 声明 list / detail / config / test 的 query、body、response；`ModerationResult` 等直接复用 sdk-client 导出，不重复手写；字段补全 `description`，数值与布尔用 `IntSchema` / `BoolSchema`。
  - 验证：schema 单测（合法与非法入参各一例）；OpenAPI 文档生成不报错。
  - 依赖：T1。
  - **实施记录**：
    - **前提发现**：sdk-client 原本只导出 `Moderation*Type`（纯类型），运行时导出只有 6 个，没有任何 moderation 的 zod schema。而路由层必须用 zod 做 `parseApiInput` 运行时校验，纯类型不够。
    - 因此先在 fastgpt-plugin 的 `sdk/client/src/index.ts` 补了 8 个 schema 导出：`ModerationCheckInputSchema`、`ModerationCheckPayloadSchema`、`ModerationCheckRunInputSchema`、`ModerationHitSchema`、`ModerationLabelSchema`、`ModerationResultSchema`、`ModerationVerdictSchema`、`ModerationDetailSchema`。标准结构仍只有一份定义（`packages/domain/src/value-objects/moderation.vo.ts`）。
    - FastGPT 侧只写自己独有的东西：`ModerationPluginConfigSchema`（本地配置记录，含 `enabled` / `deleted` / `secretsVal`）与 `AdminModerationPluginItemSchema`（plugin 数据 + 本地配置的合并展示结构，plugin 侧没有）。
    - 接口面落在 4 个路由（比原计划的 3 个多一个 delete，按确认的软删除要求）：`list` / `config` / `check` / `delete`。
    - 启用互斥写在 schema 注释和 service 层约定里：数据层允许多条 `enabled: true`（保留历史配置），由 service 在写入时保证全局只有一条启用。
  - **验证结果**：新增 `packages/global/test/openapi/core/plugin/moderation.test.ts`（5 用例）覆盖路由注册、复用 plugin 侧 schema、strict 拒绝未知字段、四档裁决、启用与软删除标记独立；`pnpm test packages/global/test/openapi` → 35 文件 / 276 用例通过；`packages/global` typecheck 0 错误。

### Phase 1：后端

- [x] **T3 service：审查插件配置的 schema / entity / service（M）** — DONE
  - 验收：`packages/service/core/plugin/moderation/{schema,entity,service,utils}.ts`；索引全部使用 `defineIndex`；secrets 入库加密、读取时按 schema 脱敏；service 提供 `listModerationPlugins`（plugin service 数据 + 本地配置合并）、`getModerationDetail`、`saveModerationConfig`、`getModerationRuntimeSecrets`（解密，仅服务端内部使用）。
  - 验证：service 单测覆盖加解密往返、脱敏、未配置 / 已配置合并。
  - 依赖：T2。
  - **实施记录**：
    - 集合名 `system_moderation_plugins`，索引两个：`{ pluginId: 1, source: 1 }`（unique，软删除后重装复用同一记录）与 `{ enabled: 1, updateTime: -1 }`。
    - 四个文件职责：`schema.ts` 只定义 Mongoose 结构；`entity.ts` 只做数据访问（含 `disableOtherModerationConfigs` 这个写侧互斥执行点）；`utils.ts` 是纯函数（可单测，加解密函数由参数注入，因此测试不依赖 AES 密钥）；`service.ts` 做编排。
    - `thirdProvider/fastgptPlugin/moderation.ts` 封装 `listPlugins({ types: ['moderation'] })` / `getModeration` / `checkModeration`，沿用 `withPluginClientLocale`。
    - **启用互斥落在 `mongoSessionRun` 事务内**：先 upsert 当前插件再停用其他，避免出现两个同时启用的瞬时窗口。
    - **删除前置条件**：已启用的插件不允许直接删除，必须先停用，否则会出现「配置指向已删除插件」的悬空状态。
    - `getAdminModerationPluginList` 对单个插件详情读取失败做降级（`available: false`），不让一个坏插件把管理页变成白屏；但 `getEnabledModerationRuntime`（运行时入口）读不到详情就报错，**不静默降级**——审查是安全能力，静默失败会变成「以为在审，其实没审」。
    - 另一个 sdk-client 补导出：`ModerationCheckInputType`（原本只在 types.ts 内部 re-export，没有从 index 透出）。
  - **验证结果**：新增 `packages/service/test/core/plugin/moderation/utils.test.ts`（17 用例）覆盖 `isSecret` 提取、脱敏不泄漏密文、掩码不覆盖真实密钥、显式清空、避免二次加密、解密失败降级；`pnpm test packages/service/test/core/plugin` → 3 文件 / 23 用例通过；`packages/service` typecheck 0 错误。
  - 文件：`packages/service/core/plugin/moderation/*`、`packages/service/thirdProvider/fastgptPlugin/moderation.ts`（封装 `listPlugins({ types: ['moderation'] })`、`getModeration`、`checkModeration`，沿用 `withPluginClientLocale`）。

- [x] **T4 admin API：列表 / 详情 / 保存配置（M）** — DONE
  - 验收：`projects/app/src/pages/api/core/plugin/admin/moderation/{list,config,delete}.ts`，统一 `authSystemAdmin` + `parseApiInput`；保存配置时按插件 `secretSchema` 校验必填项；脱敏占位值不覆盖已保存的密钥（沿用系统工具的处理方式）；响应不返回明文 secrets。
  - 验证：API 测试覆盖非管理员 403、缺必填项 400、保存后读回为脱敏值、`enabled` 切换。
  - 依赖：T3。
  - **实施记录**：
    - 三个路由全部使用 `authSystemAdmin` + `parseApiInput`，响应直接返回脱敏后的合并视图，前端可用它刷新表格行。
    - `delete` 把 `auth.tmbId` 传给 service，写入 `deletedByTmbId`。
    - 原计划的 `detail` 路由没有单独实现：列表接口已经返回 `secretSchema` 与脱敏配置，管理页不需要额外拉详情。
    - **测试模式**：handler 必须 `export async function handler` 才能被测试；默认导出的 `NextAPI(handler)` 会把错误包成 `{code, error}` 而不抛。

- [x] **T5 admin API：测试调用（S）** — DONE
  - 验收：`.../moderation/check.ts` 接收 `pluginId`、可选 `version`、`content`、可选临时 `secrets`（未传则用已保存配置），调用 `checkModeration` 并直接返回 `ModerationResult`；区分两类失败：框架级失败（抛错，返回可读的错误信息）与 `verdict: 'error'`（正常结果，原样返回）；日志不得包含 `content` 全文和 secrets。
  - 验证：测试 mock `pluginClient`，覆盖 `pass` / `block` / `suspected` / `error` 四档与框架级失败。
  - 依赖：T4。
  - **实施记录**：测试调用的 `systemVar` 填测试场景占位值（管理后台不属于任何真实会话），`chatId` 带时间戳避免与真实会话去重。
  - **验证结果**：新增 `projects/app/test/api/core/plugin/admin/moderation.test.ts`（12 用例）覆盖 root 鉴权、非法 query、非法 body、四档裁决原样返回、`error` 档不抛错、框架级失败向上抛、删除时传 tmbId；`pnpm test projects/app/test/api/core/plugin` → 15 文件 / 46 用例通过；`projects/app` typecheck 0 错误。

- [x] **T6 安装链路兼容与工具列表隔离（S）** — DONE
  - 验收：确认 admin 的 `installWithUrl`、`pkg/upload`、`pkg/confirm` 对 `type: moderation` 的 `.pkg` 可用（plugin 侧安装接口是通用的，这里主要核对返回类型与错误处理）；确认 `getSystemToolList` / `getSystemToolDetail` 不会返回 moderation 插件；如会泄漏，在 FastGPT 侧过滤。
  - 验证：测试用例：上传 / 确认一个 moderation 包后，`listModerationPlugins` 能返回，系统工具列表不包含它。
  - 依赖：T2。可与 T3 并行。
  - **实施记录（调研结论）**：
    - **隔离已经成立，且是 plugin 侧的强保证**：`packages/infrastructure/src/plugin/plugin.repo.ts` 的 `listToolSummaries` 硬编码 `types: ['tool']`，`list()` 则按调用方传入的 `types` 过滤。FastGPT 的 `getSystemToolList` 不传 `types`，因此继承工具默认值；`listModerationPlugins` 显式传 `types: ['moderation']`。
    - **安装链路无需改动**：`upload` / `confirm` / `installWithUrl` 都是类型无关的通用流程；plugin 侧由 `pluginCodecRegistry` 按 `type` 分发到 `toolPluginCodec` / `moderationPluginCodec`。`confirm.ts` 里的 `replace(/^systemTool-/)` 只处理工具 ID 前缀，对 moderation 无影响。
    - **另加了一道防御**：`listModerationPlugins` 在客户端再按 `plugin.type === 'moderation'` 过滤一次，避免 plugin 侧以后放宽过滤时审查插件混入工具列表（或反之）。
  - **验证结果**：新增 `packages/service/test/core/plugin/moderation/isolation.test.ts`（3 用例：只请求 moderation 类型、丢弃服务端误返回的工具插件、空结果透传）与 `toolIsolation.test.ts`（2 用例：工具列表不传 types 而继承 tool-only 默认值）；`pnpm test packages/service/test/core/plugin packages/service/test/core/app` → 25 文件 / 314 用例通过；typecheck 0 错误。

### Checkpoint A：后端完成后 — DONE (2026-10-28 联调实测全绿)

- [x] 新增与受影响的局部测试通过（按 AGENTS.md 只跑局部，不跑全量）
- [x] typecheck 通过（packages/global, packages/service, projects/app 全部 0 错误）
- [x] 用真实 plugin 服务（本地 fastgpt-plugin @ 3004 + FastGPT @ 3000）端到端实测跑通：
  - **安装**：CLI 生成 `test-moderation.pkg` → FastGPT `POST /api/core/plugin/admin/pkg/upload` (200) → `POST /api/core/plugin/admin/pkg/confirm` (200)
  - **隔离**：调用 `GET /api/core/plugin/admin/tool/list`，确认 `test-moderation` **未出现在系统工具列表中**（隔离有效）
  - **列表**：调用 `GET /api/core/plugin/admin/moderation/list`，成功返回 `test-moderation`，展示名称、provider、完整 secretSchema、`enabled: false`
  - **配置**：调用 `POST /api/core/plugin/admin/moderation/config`，配置 `blockedKeywords: "badword"` 与 `suspiciousKeywords: "warning"`，置 `enabled: true`
  - **正常审查**：调用 `POST /api/core/plugin/admin/moderation/check` 审查无害文本 → 返回 `verdict: "pass"`，keywords/hits 为空
  - **拦截审查**：审查含 `badword` 文本 → 返回 `verdict: "block"`, `keywords: ["badword"]`, hit 带 `providerLabel: "keyword"`
  - **疑似审查**：审查含 `warning` 文本 → 返回 `verdict: "suspected"`, `keywords: ["warning"]`
  - **临时配置覆盖**：check 传临时 secrets 审查 → 正确优先使用临时配置判定
  - **删除保护**：对 `enabled: true` 的插件直接调用 delete → 返回 500 拒绝并提示 "Disable the moderation plugin before deleting it"
  - **软删除**：先置 `enabled: false` 后成功调用 delete (200)
- [x] 评审：数据模型与全局互斥启用机制在真实双服务下行为符合预期

### Phase 2：管理 UI（按最新原型全流程实现） — DONE (2026-10-28)

- [x] **T7 admin 导航与页面框架（审核策略配置）（M）** — DONE
  - **需求与原型**：
    - 在 `AdminContainer` 新增独立一级菜单「内容审核」（商业版才展示，未激活 License 时受 `unlicensedAdminRoutes` 拦截与自动过滤）。
    - 第一版二级子目录包含「审核策略配置」（`/admin/moderation/policy`），以及「审核记录」（`/admin/moderation/records`，占位）与「审核服务日志」（`/admin/moderation/logs`，占位）。
    - 页面采用 `SettingPage` 构建，右侧四级锚点（审核服务、审核生效环节、处理策略、审核效果测试）与全局保存按钮联动。
    - 持久化：全局策略配置存储于 `MongoSystemConfigs`（`type: moderationPolicy`），通过 `/api/core/plugin/admin/moderation/policy`（GET/POST）与插件启用状态联动。
  - **实施细节**：
    - `projects/app/src/pageComponents/admin/AdminContainer.tsx`：新增「内容审核」分组菜单，图标 `checkCircle`，商业版专属。
    - `projects/app/src/pages/admin/moderation/policy.tsx` 与 `projects/app/src/pageComponents/admin/moderation/policy/index.tsx`：实现配置主页。
    - `projects/app/src/pages/api/core/plugin/admin/moderation/policy.ts`：实现 policy 读写路由。
    - 审核服务总开关关闭时，下方 3 个板块（生效环节、处理策略、效果测试）及右侧对应锚点全部隐藏；开启后完整呈现。
    - 列表默认折叠规则：当前有生效服务时默认收起，未选择服务时默认展开；支持手动「全部收起 / 展开列表」。
    - 插件空状态展示提示卡片与 `+ 从插件市场添加`、`+ 从本地安装`（复用 `ImportPluginModal`）。
  - **验证结果**：typecheck 0 错误；API 路由单测通过；权限拦截生效。

- [x] **T8 插件配置弹窗与插件行交互（M）** — DONE
  - **需求与原型**：
    - 插件列表行支持单选生效服务；**待配置状态不允许单选**，点击 toast 提示「请先配置插件参数」；已配置不可回退到待配置。
    - 插件介绍单行截断省略，鼠标悬浮显示完整 Tooltip。
    - 配置弹窗：复用插件 `secretSchema` 动态解析渲染表单，已配置凭据支持脱敏状态标识与重新修改清空。
    - 校验规则：**保存时检查必填项是否有空值**，有空值则中断并给出友好提示。
    - 删除插件二次确认气泡：使用 `PopoverConfirm` 弹出「删除插件操作无法撤销，是否确认删除？」。
  - **实施细节**：
    - `projects/app/src/pageComponents/admin/moderation/policy/PluginItemRow.tsx`：封装行组件，处理单选互斥、待配置拦截、Tooltip、PopoverConfirm 删除。
    - `projects/app/src/pageComponents/admin/moderation/policy/EditPluginModal.tsx`：基于 `jsonSchema2SecretInput` 渲染表单并执行严格必填项检查。
  - **验证结果**：单测覆盖必填拦截、脱敏保持、保存及删除；UI 构建与类型校验通过。

- [x] **T9 环节配置、处理策略与效果测试（S）** — DONE
  - **需求与原型**：
    - **审核生效环节**：用户输入（`userInput`）、模型输入（`modelInput`）、最终输出（`finalOutput`）三项开关控制。
    - **处理策略**：流式审核间隔（数字，字符/次）、疑似风险（下拉：拦截并记录 `blockAndLog` / 放行并记录 `passAndLog`）、服务异常（下拉：放行未审核内容 `pass` / 拦截未审核内容 `block`）。
    - **审核效果测试**：输入测试文本，点击「开始测试」，调用 `/api/core/plugin/admin/moderation/check`；展示通过/疑似/拦截/异常四档状态 Badge、命中关键词 Tag 列表、命中标签明细表格（标签、厂商标签、置信度）及异常信息。
  - **实施细节**：
    - `projects/app/src/pageComponents/admin/moderation/policy/ModerationTestCard.tsx`：封装效果测试卡片。
    - `projects/app/src/web/core/plugin/admin/moderation/api.ts`：封装前端请求 API。
  - **验证结果**：多档位裁决结果与错误展示正常；测试用例全部通过。

### Checkpoint B：P1 完成 — DONE (2026-10-28 管理侧端到端全绿)

- [x] 端到端：root 登录 → 安装插件 → 配置凭据（必填校验/脱敏） → 测试调用 → 互斥单选启用 → 生效环节与策略持久化，全流程可用
- [x] 局部测试、typecheck、`git diff --check` 通过
- [x] 准备就绪，待启动 P2 业务调用锚点设计（hook 接入点与流式截断设计）
- [ ] **待 UI 稿交付后进一步优化**：当前管理端 UI（页面框架、审核服务列表、配置弹窗、生效环节与策略表单、效果测试等）仅基于交互原型直接落地，功能与契约均已打通；后续待设计师正式 UI 稿输出后，需专门安排任务对视觉规范、排版间距、空态插图、微动效等进行进一步精细化对齐与优化。

## 6. 后续阶段（P2 详细设计已输出）

- **P2 调用锚点与流式拦截**：详见专项设计文档 [.agents/design/plugin/moderation-runtime-hooks.md](moderation-runtime-hooks.md)。
  - **信息接入平台（Entry Guard）**：用户问题、全局变量、表单输入，违规直接禁止请求不启动应用。
  - **信息进入模型（Model Input Guard）**：AI对话、工具调用、Agent应用，进入 agent loop 前节点报错，无有效输入不运行；agent loop 内部工具响应结果统一文案替换不中断 agent；历史上下文免审。
  - **输出检查（Output / Stream Guard）**：面向用户输出统一拦截，非流式整次不发送，流式立即停止并丢弃未展示内容；工具参数不返回客户端终止模型调用抛错；工具调用结果不返回客户端以固定特殊内容给模型。
  - **审查记录持久化**：新增 `system_moderation_records`，异步静默落库所有业务审查结果，支撑后续“审核记录”页面。
  - **清理旧 Censor**：旧版 Censor 链路无需保留，本次修改完全替换之并移除。
- **P3 多视角展示**：依赖 P2 确定审查结果落库的形状（`system_moderation_records` 已规划 `hits` 与 `providerLabel`）。
- **P4 Marketplace**：`MarketplaceToolBaseSchema.type` 与 `TeamInstalledPluginSchema.pluginType` 放开 `moderation`，按市场计划独立推进。

## 7. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| `sdk-client 2.0.0` 的 breaking 改名波及面大 | 中 | T1 先做并单独验证 |
| moderation 插件泄漏进系统工具列表 | 高 | T6 显式验证，必要时在 FastGPT 侧按类型过滤 |
| 测试调用日志泄漏待审文本或 secrets | 高 | T5 约束日志内容，并加测试 |
| 数据模型与 P2 需求不匹配（单个 vs 多个启用） | 中 | 决策 2 提前确认，Checkpoint A 复核 |
| 保存配置时用脱敏占位覆盖真实密钥 | 高 | T4 复用系统工具现有处理并补测试 |

## 8. 待确认问题

1. 配置是否使用独立集合（决策 1）？
2. 是否允许多个审查插件同时启用（决策 2）？
3. 内容审查页面在 License 未激活时是否可见（决策 4）？
4. `sdk-client 2.0.0` 是否已发布可安装（决策 5）？
5. P1 是否需要「卸载 / 删除审查插件」？当前清单未包含，建议随 P1 一起做还是放到 P4？
