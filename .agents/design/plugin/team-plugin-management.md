# Team Plugin Management Design

mode: design
cwd: /Users/finleyge/.codex/worktrees/5c85/FastGPT
task: 团队权限以上传安装和管理自己的系统插件
complexity: complex
created_at: 2026-06-29 14:56:07 CST
branch: HEAD
status: DRAFT
supersedes: ~/.gstack/projects/FinleyGe-FastGPT/finleyge-unknown-design-20260618-122036.md

## 任务概述

FastGPT 需要把“系统插件只由平台 root 管理”的模型扩展为团队可管理自己的系统插件。拥有团队 `pluginManage` 权限的成员可以从 marketplace 安装插件，也可以上传 `.pkg` 包安装到当前团队；团队还能自定义插件标签，并隐藏平台预装的系统插件。

这个能力优先服务 SaaS 团队体验。私有化部署可以复用同一套路径，但第一版不围绕私有化运维控制扩范围。

## 当前代码事实

- `team_installed_plugins` 已存在，但目前只有 `teamId/pluginType/pluginId/installed`，并有注释说明“后续改造成团队层面的对插件的管理库”：`packages/service/core/plugin/schema/teamInstalledPluginSchema.ts:7`。
- 团队插件列表已经通过 `SystemToolRepo.getSystemToolList({ sources: ['system', teamId] })` 同时读取系统插件和 team source 插件：`projects/app/src/pages/api/core/plugin/team/tool/list.ts:41`。
- `SystemToolRepo.getSystemToolList` 已支持传入 `sources`、`tags`，并统一从 plugin service 拉取工具后合并 DB 配置：`packages/service/core/app/tool/systemTool/systemTool.repo.ts:260`。
- 团队权限模型已有 `appCreate/datasetCreate/apikeyCreate/skillCreate` 等独立权限位，适合新增同类 `pluginManage`：`packages/global/support/permission/user/constant.ts:12`。
- root `.pkg` 上传和安装确认已存在，但只允许 `authSystemAdmin`，上传使用 `pluginClient.uploadPlugin`：`projects/app/src/pages/api/core/plugin/admin/pkg/upload.ts:49`。
- root marketplace 安装已存在，通过 marketplace 下载 URL 再调用 `pluginClient.installPlugins(downloadUrls)`：`projects/app/src/pages/api/core/plugin/admin/installWithUrl.ts:23`。
- 系统工具运行入口会从持久化节点读取 `toolConfig.systemTool.toolId`，再调用 `SystemToolRepo.getSystemToolRuntime`，当前普通生产 source 默认回到 `system`：`packages/service/core/workflow/dispatch/child/runTool.ts:72`。

## 问题重述

团队真正需要管理的是“当前 team 可使用哪些系统插件、这些插件如何在团队内部被组织、哪些平台预装插件不再出现在新增入口”。因此本需求的核心是团队级授权与团队级可见性策略，文件上传只是安装来源之一。

marketplace 安装和 `.pkg` 上传应落入同一条 team install 流程：

- marketplace 来源：从 marketplace 获取下载地址、版本、etag、manifest 元信息。
- upload 来源：团队成员上传 `.pkg` 或 `.zip`，由 plugin service 解析 manifest。
- 安装确认：拥有 `pluginManage` 的成员代表团队确认 manifest 声明的权限。
- 安装结果：当前 team 获得对应 plugin/version/etag 的使用授权。
- 运行判断：运行时按 team policy 判断团队插件是否仍安装；系统预装插件的 hidden 只影响新增入口。

## 前提

1. `pluginManage` 应是独立团队权限。插件安装会影响整个团队的供应链边界和运行能力，权限级别高于普通成员使用工具。
2. marketplace 安装和 `.pkg` 上传是同一类团队安装动作。两者只区分 `installSource`，运行时统一看 `registrySource` 和团队授权状态。
3. 隐藏系统预装插件与删除团队安装插件有不同语义。系统预装插件 hidden 保留旧 workflow 运行；团队插件 delete 会调用 plugin service 删除 team source 包，并撤销未来运行授权。
4. 团队自定义标签属于团队本地整理能力。它不能直接复用全局 `system_plugin_tool_tags`，否则不同团队的标签会互相污染。
5. 第一版默认单版本授权。每个 team 对同一 plugin 只有一个 active version/etag，避免多版本并存造成 UI 和运行矩阵复杂化。

## Approach A: 最小可用权限下放

Summary: 复用 root upload/install API 的大部分逻辑，新增 team API 和 `pluginManage` 鉴权；`team_installed_plugins` 只扩到安装/隐藏状态，团队标签先存在账本记录上。

Effort: M
Risk: Medium

Pros:

- 文件改动少，最快能完成 marketplace/install/upload/hide 主路径。
- 直接复用现有 team source 和 SystemToolRepo source split。
- 对现有 root 插件后台影响小。

Cons:

- 标签 rename/delete/order 容易缺失稳定归属。
- 后续做插件管理页筛选、标签统计、标签删除校验会补债。
- 容易把 `installed/hidden/deleted` 做成布尔组合，状态语义变模糊。

Reuses:

- `MongoTeamInstalledPlugin`
- `SystemToolRepo.getSystemToolList`
- root upload/installWithUrl/confirm API 的 schema 与 client 调用

## Approach B: 团队插件账本 + 团队标签目录

Summary: 把 `team_installed_plugins` 升级为团队插件 policy ledger，新增 `team_plugin_tags` 作为团队私有标签目录；团队安装、隐藏、删除、标签绑定都通过同一层 resolver 合并到列表、选择器和运行时。

Effort: L
Risk: Medium

Pros:

- 覆盖用户提出的三个点：团队安装、团队标签、隐藏系统预装插件。
- 标签管理有稳定实体，支持 rename/delete/order 和插件绑定。
- 运行时授权和新增入口过滤能共用团队 policy，避免只改 UI 列表造成绕过。

Cons:

- 比 Approach A 多一张表和一组 tag API。
- 需要认真处理旧 `installed: boolean` 迁移。
- plugin service 是否支持 team registry source 仍是实现前置条件。

Reuses:

- `team_installed_plugins` 作为 ledger
- 现有 `system_plugin_tool_tags` 的 tag API/UI 思路
- `sources: ['system', teamId]` 现有 team source 入口
- 团队权限 bit 现有模式

## Approach C: Team-private Marketplace Namespace

Summary: 团队上传 `.pkg` 后也进入 marketplace 的 team-private namespace，FastGPT app 只从 marketplace 安装，团队插件管理变成 marketplace 分发能力的上层视图。

Effort: XL
Risk: High

Pros:

- registry、版本、download URL、etag 更新检查最统一。
- 长期适合做团队私有插件商店、审批、回滚、审计。
- SaaS 多团队插件分发边界更清晰。

Cons:

- marketplace 服务要承担 team-private 鉴权和生命周期。
- 第一版会扩到 marketplace 架构改造，偏离当前产品主路径。
- app、marketplace、plugin service 三方都要改，验证成本高。

Reuses:

- marketplace tool repo/upload/delete
- app marketplace proxy
- plugin service package registry

## 推荐方案

推荐 Approach B：团队插件账本 + 团队标签目录。

原因：这次需求明确包含团队自定义标签。只升级 `team_installed_plugins` 可以解决安装和隐藏，但无法优雅承载标签管理生命周期；直接做 marketplace namespace 又超出第一版。Approach B 是可实现的完整版本，既保留 SaaS 主路径，也给后续审批、审计、更新提示留出稳定扩展点。

## 核心概念

### registrySource

描述插件运行和注册来源。

```ts
type TeamPluginRegistrySource = 'system' | 'team';
```

- `system`: 平台预装插件，由 root/system 维护。
- `team`: 当前团队安装的插件，plugin service source 应映射到当前 `teamId`。

### installSource

描述团队安装动作的入口来源。

```ts
type TeamPluginInstallSource = 'marketplace' | 'upload';
```

- `marketplace`: 从 marketplace 下载/安装。
- `upload`: 团队成员上传 `.pkg`/`.zip` 安装。

`installSource` 不参与运行时 source 选择，只用于审计、展示和后续更新检查。

### team policy status

```ts
type TeamPluginPolicyStatus = 'installed' | 'deleted' | 'hidden';
```

- `installed`: team source 插件已授权运行。
- `deleted`: team source 插件已被团队删除，plugin service 中对应 team source 包也应删除，未来运行授权撤销。
- `hidden`: system source 插件从新增入口隐藏。

状态机：

```txt
system plugin:
  visible -> hidden -> visible

team plugin:
  none -> installed -> deleted -> installed
```

## 数据模型

### team_installed_plugins

把现有表升级为团队插件账本。它同时记录团队安装授权、系统插件隐藏、团队标签绑定、版本指纹和权限确认。

```ts
type TeamInstalledPlugin = {
  _id: string;
  teamId: string;
  pluginType: 'tool';

  pluginId: string;
  version?: string;
  etag?: string;

  registrySource: 'system' | 'team';
  installSource?: 'marketplace' | 'upload';
  status: 'installed' | 'deleted' | 'hidden';
  hidden: boolean;

  teamTagIds: string[];

  packageSource?: {
    marketplaceToolId?: string;
    marketplaceSource?: string;
    downloadUrlHash?: string;
    uploadedFileName?: string;
  };

  confirmedPermissions: string[];
  permissionsConfirmedAt?: Date;

  installedByTmbId?: string;
  installedAt?: Date;
  updatedByTmbId?: string;
  updatedAt?: Date;
  deletedByTmbId?: string;
  deletedAt?: Date;
  hiddenByTmbId?: string;
  hiddenAt?: Date;

  createTime: Date;
  updateTime: Date;
};
```

建议索引：

```ts
TeamInstalledPluginSchema.index({ teamId: 1, registrySource: 1, pluginId: 1 }, { unique: true });
TeamInstalledPluginSchema.index({ teamId: 1, status: 1, updateTime: -1 });
TeamInstalledPluginSchema.index({ teamId: 1, teamTagIds: 1 });
TeamInstalledPluginSchema.index({ teamId: 1, hidden: 1 });
```

迁移规则：

- 旧记录 `installed: true` -> `registrySource = 'team'`、`status = 'installed'`、`hidden = false`。
- 旧记录 `installed: false` -> `registrySource = 'team'`、`status = 'deleted'`、`hidden = false`。
- 保留 `installed` 作为 deprecated 兼容字段一版，读写都以 `status` 为准。

### team_plugin_tags

新增团队私有标签目录。

```ts
type TeamPluginTag = {
  _id: string;
  teamId: string;
  tagId: string;
  tagName: string;
  tagOrder: number;
  color?: string;
  createTime: Date;
  updateTime: Date;
};
```

建议索引：

```ts
TeamPluginTagSchema.index({ teamId: 1, tagId: 1 }, { unique: true });
TeamPluginTagSchema.index({ teamId: 1, tagOrder: 1 });
```

标签删除规则：

- 删除标签时从所有 `team_installed_plugins.teamTagIds` 中移除该 `tagId`。
- tagId 稳定，rename 只改 `tagName`。
- 团队标签只影响团队管理页和团队工具选择器的本地分类，不写回 plugin manifest tags。

## 权限模型

新增团队权限：

```ts
export enum TeamPerKeyEnum {
  appCreate = 'appCreate',
  datasetCreate = 'datasetCreate',
  apikeyCreate = 'apikeyCreate',
  skillCreate = 'skillCreate',
  pluginManage = 'pluginManage'
}
```

建议：

- `pluginManage` 与 `appCreate/skillCreate` 一样是 `checkBoxType: 'multiple'`。
- Team owner 和 manage 权限天然拥有插件管理能力。
- 拥有 `pluginManage` 的成员可安装、上传、更新、删除、隐藏、管理团队插件标签。
- 普通成员可使用团队已安装且可见的插件，但不能改变团队插件状态。
- 第一版不把 `pluginManage` 绑定到 `appCreate` 或 `skillCreate`。

## API 设计

所有 team 管理写接口使用 `parseApiInput` 校验入参，并鉴权 `pluginManage`。

### 团队插件列表

```txt
GET /api/core/plugin/team/tool/list
```

扩展 query：

```ts
{
  includeHidden?: boolean;
  includeDeleted?: boolean;
  teamTagIds?: string[];
  source?: 'all' | 'system' | 'team';
}
```

返回项补充：

```ts
{
  registrySource: 'system' | 'team';
  installSource?: 'marketplace' | 'upload';
  teamInstallStatus: 'system' | 'installed' | 'deleted' | 'hidden';
  teamHidden: boolean;
  teamTagIds: string[];
  confirmedPermissions?: string[];
  installedVersion?: string;
  installedEtag?: string;
  canManage: boolean;
}
```

规则：

- 默认返回未隐藏系统插件 + 已安装团队插件。
- 管理视图可通过 `includeHidden/includeDeleted` 查看隐藏和删除记录。
- team source 插件不提供 `SoonOffline` 状态；管理视图只展示团队安装状态、删除状态以及 plugin service 返回的可运行/不可运行状态。
- `teamTagIds` 过滤使用团队本地标签；插件 manifest tags 继续保留原有搜索/排序语义。

### 团队标签管理

```txt
GET  /api/core/plugin/team/tag/list
POST /api/core/plugin/team/tag/create
PUT  /api/core/plugin/team/tag/update
PUT  /api/core/plugin/team/tag/updateOrder
DELETE /api/core/plugin/team/tag/delete
```

写操作均需要 `pluginManage`。删除标签时批量从团队插件账本移除引用。

### 绑定团队标签

```txt
PUT /api/core/plugin/team/tool/tag/update
```

请求：

```ts
{
  pluginId: string;
  registrySource: 'system' | 'team';
  teamTagIds: string[];
}
```

规则：

- 只允许绑定当前 team 已有 tagId。
- 对 system 插件，如果此前没有 policy 记录，则创建一条 `registrySource = 'system'` 的 policy 记录，`status` 按当前 hidden 状态推导。
- 对 team 插件，必须存在当前 team 的安装/删除记录。

### 上传 pkg 并预览

```txt
POST /api/core/plugin/team/pkg/upload
```

行为：

- 鉴权 `pluginManage`。
- 接收 `.pkg` 或 `.zip`。
- 复用 root upload 的 multipart 解析和 `UploadPkgPluginResponseSchema`。
- 调用 plugin service 解析包，返回待确认插件信息和 manifest permissions。
- 不写入团队授权，等待 confirm。

### marketplace 安装预览

```txt
POST /api/core/plugin/team/pkg/prepareFromMarketplace
```

请求：

```ts
{
  toolId: string;
  version?: string;
}
```

行为：

- 鉴权 `pluginManage`。
- 从 marketplace 获取目标版本、etag、downloadUrl 和 manifest 元信息。
- 返回与 upload preview 一致的确认数据。
- 如果只能拿 downloadUrl，第一版可以把 preview 合并到 confirm 前端流程，但后端仍要在 confirm 时二次校验 version/etag。

### 确认安装

```txt
POST /api/core/plugin/team/pkg/confirm
```

请求：

```ts
{
  pluginId: string;
  version: string;
  etag: string;
  installSource: 'marketplace' | 'upload';
  confirmedPermissions: string[];
  teamTagIds?: string[];
}
```

行为：

1. 鉴权 `pluginManage`。
2. 校验 `teamTagIds` 都属于当前 team。
3. 重新读取/校验 manifest permissions，与用户确认的 `confirmedPermissions` 保持一致。
4. 调用 plugin service，把插件确认到当前 team registry source。
5. upsert `team_installed_plugins`：
   - `teamId`
   - `pluginId`
   - `registrySource = 'team'`
   - `installSource`
   - `status = 'installed'`
   - `hidden = false`
   - `version/etag`
   - `confirmedPermissions`
   - `teamTagIds`
   - `installedByTmbId/installedAt`

实现阻塞点：当前仓库内只有 root `pluginClient.confirmPlugin(toolIds)` 调用，未看到可传 `source/teamId` 的参数。实现前必须确认 `@fastgpt-plugin/sdk-client` 是否支持 confirm 到 team source；如果不支持，需要先扩展 plugin service/SDK，不能把团队插件伪装成 system 插件。

### 隐藏系统预装插件

```txt
POST /api/core/plugin/team/tool/hide
```

请求：

```ts
{
  pluginId: string;
  hidden: boolean;
}
```

规则：

- 仅允许 `registrySource = 'system'`。
- 鉴权 `pluginManage`。
- 写入或更新 `team_installed_plugins`：`registrySource = 'system'`、`hidden`、`status = hidden ? 'hidden' : 'installed'`。
- 不删除系统插件，不调用 plugin service 删除。

### 删除团队插件

```txt
POST /api/core/plugin/team/tool/delete
```

请求：

```ts
{
  pluginId: string;
}
```

规则：

- 仅允许 `registrySource = 'team'`。
- 鉴权 `pluginManage`。
- 删除前必须弹出确认提示，说明该操作会从团队插件库删除插件包，已有 workflow / Agent 节点未来运行会失败；如需恢复，需要重新上传或从 marketplace 重新安装。
- 后端调用 plugin service 删除接口，删除当前 team source 下的插件包，例如 `pluginClient.deletePlugin({ pluginId, source: teamId })` 或等价 SDK 方法。
- plugin service 删除成功后，更新账本 `status = 'deleted'`，记录 `deletedByTmbId/deletedAt`。
- 删除接口应幂等：plugin service 返回 not found 时，FastGPT 仍可把账本收敛为 `deleted`，用于清理陈旧状态。
- 不允许通过团队删除接口删除 system source 插件；系统预装插件只能 hidden。

## 运行时规则

### 新增入口过滤

新增团队插件 policy resolver：

```ts
type TeamPluginPolicyMap = Map<
  `${'system' | 'team'}:${string}`,
  {
    status: 'installed' | 'deleted' | 'hidden';
    hidden: boolean;
    teamTagIds: string[];
    version?: string;
    etag?: string;
    confirmedPermissions: string[];
  }
>;
```

使用点：

- `/api/core/plugin/team/tool/list`
- `/api/core/app/tool/getSystemToolTemplates`
- workflow 工具选择器
- Agent 工具候选列表
- marketplace 已安装/可更新状态

过滤规则：

- system source 插件：如果 policy `hidden = true`，新增入口过滤；管理视图可查看。
- team source 插件：必须存在 policy 且 `status = 'installed'` 才能进入新增入口。
- debug source 继续只跟随当前调试会话，不受 team policy 影响。
- `PluginStatusEnum.Offline` 继续遵循现有过滤，不被 team policy 覆盖。
- team source 插件不进入 `PluginStatusEnum.SoonOffline` 流程；团队管理页不提供“即将下线”配置，只提供删除。

### workflow 运行校验

系统预装插件：

- 如果 source 是 system 且 team policy hidden，旧 workflow 继续运行。
- 运行元数据可以返回 `teamHidden: true`，前端节点展示 warning。

团队安装插件：

- source 必须解析到当前 `teamId`。
- 必须存在 `team_installed_plugins` 且 `status = 'installed'`。
- 缺失或 `deleted` 时 fail closed，返回明确错误：`plugin.team_not_installed` 或 `plugin.team_deleted`。
- 运行时校验应放在 `SystemToolRepo.getSystemToolRuntime` 附近或一个上层 team-aware runtime resolver 中，避免只过滤列表造成旧节点绕过。

### 工具节点 source 持久化

当前运行入口普通 production source 默认回到 `system`。团队安装插件进入 workflow 时，节点必须持久化 source 信息，使运行时能区分 system/team：

```ts
toolConfig: {
  systemTool: {
    toolId: 'systemTool-xxx',
    source: 'team'
  }
}
```

API 层把 `source = 'team'` 映射为当前 `teamId`，避免前端持久化真实 `teamId`。

## UI 设计

### 团队插件管理页

入口建议继续复用“系统工具/插件管理”页面结构，但按用户权限区分：

- 普通成员：只看到团队可用插件和详情。
- `pluginManage` 成员：看到安装、上传、隐藏、删除、标签管理。
- root/system admin：保留现有系统级后台能力。

主区域：

- 顶部 tabs：可用插件、Marketplace、已隐藏、已删除、标签管理。
- 左侧过滤：系统预装、团队安装、上传安装、标签。
- 列表项展示：来源、安装状态、版本、etag、权限摘要、团队标签。
- 团队级插件不展示也不配置“即将下线”；如果需要让团队插件不可用，使用删除操作。

### 安装确认抽屉

必须显示：

- 插件名称、作者、版本、etag。
- 来源：Marketplace 或上传。
- 影响范围：安装后全团队可用。
- 权限清单：manifest permissions。
- 删除语义：删除团队插件后旧 workflow 将无法运行。
- 可选团队标签。

确认按钮文案：`为团队安装`。

### 隐藏与删除状态提示

- 系统预装插件 hidden：列表和旧节点显示 warning，提示“团队已隐藏，新 workflow 不可再选择，已有 workflow 继续运行”。
- 团队插件 deleted：旧节点显示 error，提示“团队已删除该插件，运行将失败；如需恢复，请重新安装”。
- 点击删除按钮时弹出强确认：提示会删除 plugin service 中当前团队 source 下的插件包、移除新增入口、导致已有 workflow/Agent 节点运行失败，并要求用户确认后再执行。

### 粗线框

```txt
┌────────────────────────────────────────────────────────────────────┐
│ 团队插件管理                         [上传 .pkg] [从 Marketplace 安装] │
├───────────────┬────────────────────────────────────────────────────┤
│ 标签           │ 可用插件  Marketplace  已隐藏  已删除  标签管理        │
│ [全部]         │                                                    │
│ [搜索]         │ ┌────────────────────────────────────────────────┐ │
│ # 财务         │ │ Slack 通知                                      │ │
│ # 数据同步      │ │ 来源: marketplace · team · v1.4.2 · 已安装       │ │
│ # 内部工具      │ │ 标签: 数据同步                                  │ │
│               │ │ [查看权限] [更新] [删除]                         │ │
│               │ └────────────────────────────────────────────────┘ │
│               │ ┌────────────────────────────────────────────────┐ │
│               │ │ 网页搜索                                        │ │
│               │ │ 来源: system · 平台预装 · 已隐藏                 │ │
│               │ │ [取消隐藏]                                      │ │
│               │ └────────────────────────────────────────────────┘ │
└───────────────┴────────────────────────────────────────────────────┘

安装确认抽屉:
┌─────────────────────────────┐
│ 为团队安装: Notion          │
│ version: 2.1.0              │
│ etag: sha256:...            │
│ 来源: upload                │
│ 权限:                       │
│ - network.fetch             │
│ - secret.read               │
│ 标签: [数据同步] [内部工具]  │
│ [取消] [为团队安装]          │
└─────────────────────────────┘
```

## 工程决策

### 决策 1A: 先补齐 plugin service / SDK 的 team source install contract

团队插件安装必须真实写入当前团队对应的 plugin registry source。实现顺序是先确认并补齐 plugin service / `@fastgpt-plugin/sdk-client` 对 team source 的安装、确认、列表、详情、版本和运行能力，再接 FastGPT app 层的 team upload / marketplace install API。

约束：

- `confirmPlugin` 或等价接口必须能指定目标 source，例如由 FastGPT 后端把当前 `teamId` 传给 plugin service。
- `listTools({ sources: [teamId] })`、`getTool({ source: teamId })`、`listPluginVersions({ source: teamId })` 和运行时 detail 必须对同一 source 一致。
- FastGPT 不能把团队插件确认成 `system` source 再靠 UI 或账本过滤隔离团队，否则会破坏 SaaS 多团队边界。
- app 层 confirm 必须在写入 `team_installed_plugins` 前完成 manifest permission、version、etag 的二次校验。

### 决策 2A: 节点持久化 `source: 'team'`，运行时映射为当前 team source

团队插件进入 workflow / Agent 工具节点时，前端和工作流 JSON 只持久化抽象 source：

```ts
toolConfig: {
  systemTool: {
    toolId: 'systemTool-xxx',
    source: 'team'
  }
}
```

运行时由 FastGPT 后端根据当前执行身份把 `source: 'team'` 映射为 `runningUserInfo.teamId`，并在调用 plugin service 前校验 `team_installed_plugins` 中对应记录仍为 `status = 'installed'`。

约束：

- workflow 普通 tool、toolset 展开出的 child tool、Agent 工具调用都必须保留并解释 `source: 'team'`。
- 前端和持久化节点不保存真实 `teamId`，避免跨团队复制 workflow 时泄露或固定旧 team source。
- 旧节点缺少 `source` 时继续按 `system` 处理，保证既有系统插件工作流兼容。
- team 插件缺失安装记录或已删除时 fail closed，返回明确错误；system hidden 只影响新增入口，旧 workflow 继续运行。

### 决策 3: 系统 admin 后台增加团队上传插件总开关

系统 admin 后台的功能清单中新增“团队上传插件”开关，建议映射到 `feConfigs.show_team_plugin_upload` 或同语义配置项。该开关是平台级能力闸门，用于控制 SaaS 是否允许团队成员通过 `pluginManage` 上传 `.pkg`。

约束：

- 开关关闭时，隐藏团队插件管理页里的“上传 .pkg”入口，并禁止 team pkg upload API；marketplace 安装是否受该开关影响由产品配置决定，第一版建议仅控制本地上传入口。
- 开关开启时，仍必须校验团队成员是否拥有 `pluginManage` 权限。
- 系统 root/admin 的系统级插件上传能力不受该开关影响。
- 前端功能显隐和后端 API 鉴权都要接入该开关，避免只隐藏按钮造成绕过。

## 依赖与阻塞点

- 必须先实现或确认 plugin service / `@fastgpt-plugin/sdk-client` 支持把插件安装确认到 team source，例如 `source = teamId`。
- 必须验证 plugin service 的 `listTools({ sources: [teamId] })` 在当前环境能列出团队 source 包，并且版本/etag/detail/runtime 都一致。
- 如果 marketplace 只能返回 downloadUrl，后端 confirm 必须二次校验版本与 etag，避免前端伪造安装目标。
- 团队 `.pkg` 上传是供应链入口。第一版至少记录安装人、来源、etag、权限清单，并受系统 admin 功能清单中的“团队上传插件”开关控制，后续可接入审计日志和风控。

## 测试计划

### 单元测试

- `TeamPermission` 新增 `pluginManage` role/per 映射。
- team plugin policy resolver 正确合并 system/team/debug 状态。
- 团队标签 rename/delete/order 不影响其他 team。
- 删除团队标签会从插件账本移除引用。
- system hidden 只过滤新增入口。
- team deleted 阻断运行授权。
- 团队级插件不会进入 `SoonOffline` 状态。
- 系统 admin “团队上传插件”开关关闭时，上传入口和 API 都不可用。

### API 测试

- 普通成员调用 upload/confirm/hide/delete/tag 写接口被拒绝。
- `pluginManage` 成员可上传 `.pkg` 并确认安装。
- `pluginManage` 成员可从 marketplace 安装。
- hide/unhide system plugin 幂等。
- delete team plugin 会调用 plugin service 删除接口，并在 not found 时幂等收敛为 deleted。
- cross-team 无法读取或修改其他团队的安装记录和标签。

### 集成测试

- 团队 A 安装 upload 插件，团队 B 不可见。
- 团队 A 隐藏 system 插件，团队 B 仍可见。
- 被隐藏 system 插件的旧 workflow 继续运行。
- 被删除 team 插件的旧 workflow 运行失败且错误明确。
- Agent 工具候选不会包含团队隐藏或未安装插件。
- Marketplace 卡片能显示当前 team 已安装/可更新状态。

### 回归测试

- root 系统插件上传、确认、marketplace installWithUrl 保持现有行为。
- `PluginStatusEnum.Offline/SoonOffline` 对系统插件的现有过滤语义保持不变；team source 插件不新增 SoonOffline 状态。
- debug source 不受团队插件 policy 影响。
- commercial workflow tool、associated workflow tool 不被误判为 team upload plugin。

## 风险与注意事项

- 最大风险是只改团队插件列表，没有改运行入口；旧 workflow 可能绕过删除状态继续运行。
- `hidden` 与 `deleted` 必须保持不同语义。隐藏系统预装插件保留运行，删除团队插件会物理删除当前 team source 包并撤销运行授权。
- 团队标签不能写入全局 `system_plugin_tool_tags`，否则 SaaS 多团队标签会互相污染。
- `.pkg upload` 必须保留安装确认和权限记录，避免团队成员在未理解权限的情况下引入高风险插件。
- 不能把团队插件确认成 system source 再靠 FastGPT 过滤。这样会破坏团队隔离。
- 删除团队插件必须先调用 plugin service 删除当前 team source 下的包，再把 FastGPT 账本收敛为 `deleted`；不能只做逻辑删除。

## 成功标准

- 团队 `pluginManage` 权限可独立配置。
- 拥有权限的成员可从 marketplace 安装插件到当前 team。
- 拥有权限的成员可上传 `.pkg` 并安装到当前 team。
- 安装确认页展示版本、etag、影响范围和权限清单，并记录 `confirmedPermissions`。
- 团队可以创建、重命名、排序、删除自定义插件标签，并把标签绑定到 system/team 插件。
- 团队可以隐藏系统预装插件，隐藏后新增入口不可选，旧 workflow 继续运行。
- 团队可以删除团队安装插件，删除时有强提示，删除后新增入口不可选，旧 workflow 运行 fail closed。
- 团队 A 的安装、隐藏、标签不影响团队 B。
- 系统 admin 后台功能清单可以关闭团队上传插件能力；关闭后上传入口和 API 都不可用。

## TODO

- [ ] 先扩展或验证 plugin service/SDK 支持 `confirmPlugin` 指定 team source，并覆盖 list/detail/version/runtime contract。FastGPT 侧已做安装后 read-back fail closed。
- [x] 设计并实现 `TeamInstalledPluginStatus`、`registrySource`、`installSource` schema 迁移。
- [x] 新增 `team_plugin_tags` schema/entity/service。
- [x] 新增 `pluginManage` 权限位、i18n 和团队权限 UI。
- [x] 新增系统配置开关字段，控制团队上传插件入口和 API。本仓未包含系统 admin 功能清单表单入口，后续需在对应 admin 前端加展示项。
- [x] 新增 team pkg upload/prepare/confirm/hide/delete/tag API 与 OpenAPI schema。
- [x] 实现 team plugin policy resolver。
- [x] 接入团队插件列表、工具选择器、Agent 工具候选和 marketplace 安装状态。
- [x] 在系统工具运行入口接入团队安装授权校验。
- [x] 隐藏系统插件和删除团队插件状态已接入列表与运行时；节点卡片继续按既有系统工具状态展示。
- [x] 补齐 team list、工具选择器和运行时相关 focused 测试。

## Spec Review

当前多 agent 工具要求只有用户明确请求 subagent/delegation 时才可派发 subagent，因此本轮未启动独立 reviewer。已完成自审：

| Dimension | Result | Notes |
|-----------|--------|-------|
| Completeness | PASS | 覆盖团队安装、上传、标签、隐藏、删除、运行时和测试面 |
| Consistency | PASS | 明确区分 `registrySource`、`installSource`、`status`、`hidden` |
| Clarity | PASS_WITH_CONCERN | 实现前必须确认 plugin service team source 支持 |
| Scope | PASS | 第一版不做成员级可见性、团队私有 marketplace namespace、审批中心 |
| Feasibility | PASS_WITH_CONCERN | 运行时授权接入点需要实现时精确落在统一入口 |

Quality score: 8.5/10
