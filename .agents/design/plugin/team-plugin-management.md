# Team Plugin Management Design

mode: design
cwd: /Volumes/Code/FastGPT
task: 团队安装和管理自己的系统插件
complexity: complex
updated_at: 2026-08-03
status: IMPLEMENTED

## 任务概述

FastGPT 允许团队管理员从 Marketplace 安装插件，或上传
`.pkg` / `.zip` 安装到当前团队。团队插件可以删除和重新安装，系统预装插件继续由
系统管理员统一管理。

本次 PR 只覆盖团队插件安装、删除、列表和运行时授权。以下能力不在本次范围：

- 团队修改系统预装插件的可见性。
- 团队自定义插件标签及标签绑定。
- 团队插件的 `SoonOffline` 状态。

## 核心决策

### 团队 policy 只记录团队安装插件

`team_installed_plugins` 是团队安装授权账本，只记录当前团队安装过的插件。系统预装
插件不写入该表，也不存在团队级 `hidden` 状态。

```ts
type TeamPluginPolicyStatus = 'installed' | 'deleted';

type TeamInstalledPlugin = {
  teamId: string;
  pluginType: 'tool';
  pluginId: string;
  version?: string;
  etag?: string;
  installSource?: 'marketplace' | 'upload';
  status?: TeamPluginPolicyStatus;
  packageSource?: {
    marketplaceToolId?: string;
    marketplaceSource?: string;
    downloadUrlHash?: string;
    uploadedFileName?: string;
  };
  confirmedPermissions?: string[];
  permissionsConfirmedAt?: Date;
  installedByTmbId?: string;
  installedAt?: Date;
  updatedByTmbId?: string;
  updatedAt?: Date;
  deletedByTmbId?: string;
  deletedAt?: Date;
  createTime?: Date;
  updateTime?: Date;
  installed?: boolean;
};
```

兼容规则：

- `status` 是当前读写依据。
- 旧记录缺少 `status` 时，`installed === false` 视为 `deleted`，其余视为 `installed`。
- 唯一索引为 `{ teamId, pluginId }`。

### 插件 source 使用带类型前缀的真实 source

团队插件 source 统一使用：

```ts
const source = `teamId:${teamId}`;
```

它与 debug source 的设计一致：

```txt
system
teamId:<teamId>
debug:tmbId:<tmbId>
```

约束：

- 安装、确认、列表、详情、版本、删除和运行调用 plugin service 时均使用
  `teamId:<teamId>`。
- 工作流节点、工具集子工具和 Agent selected tool 持久化完整的 team source。
- 运行时解析 source 中的 teamId，并要求它等于当前执行团队。
- 运行时同时检查 `team_installed_plugins.status === installed`。
- source 与当前团队不一致、记录缺失或状态为 `deleted` 时 fail closed。
- 旧节点缺少 source 时继续按 `system` 处理。

统一 helper 位于 `packages/global/core/app/tool/utils.ts`：

```ts
getTeamPluginSource(teamId);
isTeamPluginSource(source);
parseTeamPluginSource(source);
```

### 安装入口共享同一条授权流程

Marketplace 安装和上传安装都写入当前 team source，仅通过 `installSource` 区分来源：

```ts
type TeamPluginInstallSource = 'marketplace' | 'upload';
```

安装流程：

1. 使用团队管理员权限鉴权。
2. 调用 plugin service 安装或确认到 `teamId:<teamId>`。
3. 从同一 source 读回插件，确认插件真实可用。
4. upsert 团队安装 policy 为 `installed`。

删除流程：

1. 使用团队管理员权限鉴权。
2. 校验团队安装 policy 存在且为 `installed`。
3. 调用 plugin service 删除 `teamId:<teamId>` 下的插件。
4. 将 policy 更新为 `deleted`。

删除按钮必须展示强确认提示，明确已有 workflow / Agent 节点后续会运行失败。

## API Surface

保留接口：

```txt
GET  /api/core/plugin/team/tool/list
GET  /api/core/plugin/team/tool/detail
GET  /api/core/plugin/team/tool/versions
POST /api/core/plugin/team/tool/delete
POST /api/core/plugin/team/pkg/upload
POST /api/core/plugin/team/pkg/confirm
POST /api/core/plugin/team/pkg/installWithUrl
```

删除接口：

```txt
POST   /api/core/plugin/team/tool/hide
PUT    /api/core/plugin/team/tool/tag/update
GET    /api/core/plugin/team/tag/list
POST   /api/core/plugin/team/tag/create
PUT    /api/core/plugin/team/tag/update
PUT    /api/core/plugin/team/tag/updateOrder
DELETE /api/core/plugin/team/tag/delete
```

团队插件列表支持：

```ts
type TeamPluginListQuery = {
  includeDeleted?: boolean;
  includeDebug?: boolean;
  source?: 'all' | 'system' | 'team';
};
```

系统插件始终遵循系统级可见性和状态配置。团队插件仅在 policy 为 `installed` 时进入普通
列表；管理页可通过 `includeDeleted` 查看删除记录。

## UI Surface

团队插件管理页保留三个 tab：

- 可用插件：系统预装插件和当前团队已安装插件。
- Marketplace：搜索、安装和重新安装。
- 已删除：展示团队删除记录。

页面保留上传、安装、删除确认、版本、etag 和安装来源信息。页面移除系统插件隐藏按钮、
已隐藏 tab、标签管理 tab、标签编辑和标签绑定列。

## 运行时规则

### 新增入口

- system source：按系统插件配置展示。
- `teamId:<teamId>` source：要求当前团队 policy 为 `installed`。
- debug source：继续跟随当前调试会话，不受团队安装 policy 影响。

### 已有节点

- system 节点继续按既有逻辑运行。
- team 节点必须通过 source teamId 校验和安装 policy 校验。
- 已删除团队插件、跨团队复制的 team 节点和伪造 team source 均拒绝运行。

## 配置与权限

- 只有团队管理员可以安装、上传和删除团队插件。
- team owner 和 manage 权限包含插件管理能力。
- admin 后台“功能清单”中的“团队上传插件”开关写入
  `enable_team_plugin_upload`。虽然配置名称沿用“上传插件”，该开关控制团队插件安装入口、上传 API、确认 API 和 Marketplace 安装 API；旧配置缺少该字段时默认关闭。
- 页面仍允许通过链接直接访问，但开关关闭时所有团队插件安装接口都拒绝请求。

## 测试计划

- source helper 正确生成、识别和解析 `teamId:<teamId>`。
- 列表同时请求 `system`、当前 team source 和活动 debug source。
- 系统 Offline 插件不进入列表。
- 团队 policy 缺失或 `deleted` 时不进入普通列表。
- `includeDeleted` 返回删除占位项，source 为当前 team source。
- detail、versions、preview、path 拒绝其他团队的 source。
- workflow tool、toolset child 和 Agent tool 持久化并使用完整 team source。
- 运行时在 policy 删除或 source teamId 不匹配时 fail closed。
- 上传确认、Marketplace 安装和删除均调用同一 team source。
- app typecheck、相关 app/service/global tests 和 `git diff --check` 通过。

## 风险与注意事项

- source 格式必须在所有入口一次性迁移，避免列表返回新格式而运行时仍解释旧的 `team`。
- plugin service 必须把 `teamId:<teamId>` 当作独立 registry source。
- 本 PR 尚未合并，旧的 `team` source、system hidden policy 和团队标签数据不做线上迁移。
- 删除团队插件会撤销未来运行授权，确认提示和 fail-closed 校验必须保留。

## TODO

- [x] 团队 policy 状态收敛为 `installed/deleted`。
- [x] 移除系统插件团队隐藏 API、OpenAPI、UI 和 policy 逻辑。
- [x] 移除团队标签 schema、API、OpenAPI、UI 和 policy 逻辑。
- [x] 增加 `teamId:<teamId>` source helper 并迁移安装、列表、详情和运行时。
- [x] 在 admin 后台功能清单增加“团队上传插件”开关。
- [x] 更新团队插件相关测试。
- [x] 与 plugin service 联调 `teamId:<teamId>` source 的安装、读回、运行和删除。
