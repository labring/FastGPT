# 应用资源权限快照设计

## 1. 背景与目标

应用协作编排时，工作流节点保存的是资源引用，但运行时仍有多处分支按当前运行人的 `tmbId` 检查知识库、Skill、子 App 和工具权限。应用编辑者、发布者和实际运行者不一致时，同一个发布版本可能得到不同结果。

本设计将工作流引用的资源保存为应用版本的资源权限快照：

- 创建、自动保存、普通保存和正式发布时，全量校验当前操作人的资源读取权限；
- App Version 保存每个版本的资源事实；
- App 主表保存当前正式发布版本的资源缓存；
- 正式运行使用实际选中 Version 的资源快照，不再用运行人的个人权限替代应用权限；
- 调用人访问当前 App 的入口权限仍然保留。

本设计只调整工作流内部资源授权，不重做 App 版本系统，也不改变 MCP/HTTP 工具集、工作副本、类型转换和本地草稿等合理的既有产品语义。

## 2. 资源模型

### 2.1 `AppResource`

统一使用 `resources`，不继续扩展过渡字段 `resourceRefs`：

```ts
type AppResource =
  | {
      type: 'tool';
      id: string;
      data?: {
        toolNames?: string[];
      };
    }
  | {
      type: 'model';
      id: string;
      data: {
        modelType: 'llm' | 'rerank' | 'tts';
      };
    }
  | {
      type: 'agent' | 'dataset' | 'skill';
      id: string;
    };
```

资源含义：

- `tool`：个人工作流工具、MCP 工具集、HTTP 工具集；
- `agent`：被工作流、Agent 或工具引用的个人 App；
- `dataset`：知识库；
- `skill`：Agent Skill；
- `model`：应用显式配置的模型，只用于统计，不参与资源权限判断；知识库自己的向量模型和 VLM 属于 Dataset 配置，不重复写入 App 快照；
- `data.toolNames`：MCP/HTTP 工具集允许执行的子工具名。
- `data.modelType`：区分 LLM、Rerank 和 TTS，避免同名模型统计冲突。

系统工具和商业工具不进入应用资源权限快照，继续使用原有系统可用性、商业授权和计费逻辑。

### 2.2 工具资源

工具必须纳入资源权限快照。工作流节点继续保存用于执行的完整工具 ID：

```text
personal-toolAppId
mcp-parentAppId/search
http-parentAppId/request
systemTool-search
```

`resources` 保存权限主体：

```ts
[
  {
    type: 'tool',
    id: 'personal-toolAppId'
  },
  {
    type: 'tool',
    id: 'mcp-parentAppId',
    data: {
      toolNames: ['search']
    }
  }
]
```

规则：

- 个人工作流工具保存工具 App ID；
- MCP/HTTP 子工具保存父工具集 App ID，并通过 `toolNames` 限制具体工具；
- 只引用整个工具集时不保存 `toolNames`，表示允许整个工具集；
- 同一工具集的子工具名合并、去重并稳定排序；
- 同时存在整工具集引用和子工具引用时，以整工具集引用为准；
- 系统工具和商业工具不生成 `tool` 资源；
- `mcp-parentAppId/search` 不能直接作为 MongoDB App ID 使用，必须通过现有工具 ID 解析函数归一化。

### 2.3 去重与稳定性

非模型资源按 `type + id` 去重，模型按 `type + data.modelType + id` 去重，并统一稳定排序。`toolNames` 也必须去重和稳定排序，避免节点顺序变化导致无意义的版本差异。

## 3. 数据库存储

### 3.1 App Version 资源事实

每条 App Version 保存同一次工作流配置产生的数据：

```text
nodes
edges
chatConfig
resources
```

`app_versions.resources` 是该版本的资源事实。普通保存、自动保存和正式发布版本都写入自己的 `resources`，确保恢复任意版本时节点和资源信息一致。

只有 `isPublish: true` 的 Version.resources 构成正式运行的应用授权。普通保存和自动保存中的 resources 只是草稿事实，不授予正式运行权限，Test/Debug 也不会直接使用它们绕过当前操作人的权限。

### 3.2 App 最新发布缓存

`apps.resources` 是当前最新正式发布版本的资源缓存，用于资源反查、统计和列表查询。对于历史上没有正式
Version 的 App，它只能作为迁移和反查缓存，不能作为运行时事实。

它只在以下场景更新：

- 创建非文件夹 App 并生成首个正式版本；
- 正式发布新版本。

普通保存、自动保存、`/api/core/app/update` 修改工作副本和原地类型转换都不能更新 `apps.resources`，否则未发布资源会提前进入正式缓存。

正式运行正常情况下必须使用实际选中 Version 的 `resources`，不能用 `apps.resources` 替代版本事实。

### 3.3 删除 `resourceRefs`

当前 `resourceRefs.skillIds` 只是过渡结构。新代码只读写 `resources`，不做 `resources/resourceRefs` 双写或长期双读。

迁移脚本负责：

1. 读取历史 `resourceRefs.skillIds` 和节点配置；
2. 生成完整 `resources`；
3. 回填 App Version 和 App；
4. 校验迁移结果；
5. `$unset` 删除 `resourceRefs`；
6. 通过 `defineIndex(..., { deprecated: true })` 清理旧 `resourceRefs.skillIds` 索引。

迁移完成后从 Global 类型、Mongoose 字段定义、OpenAPI Schema、查询函数和业务代码中直接删除 `resourceRefs`；Mongoose Schema 仅保留旧索引的 `deprecated` 声明，直到索引管理器完成清理。

### 3.4 索引

App 主表需要支持当前发布资源反查：

```ts
defineIndex(AppSchema, {
  key: {
    teamId: 1,
    deleteTime: 1,
    'resources.type': 1,
    'resources.id': 1
  }
});
```

查询 `type + id` 时必须使用 `$elemMatch`，保证两个条件命中同一条资源记录。

App Version 增加资源复合索引，支持按 App 和资源主体批量查询：

```ts
defineIndex(AppVersionSchema, {
  key: {
    appId: 1,
    'resources.type': 1,
    'resources.id': 1
  }
});
```

现有 `{ appId: 1, time: -1 }` 索引和版本排序保持不变。运行入口先读取实际选中的 Version，再按该 Version 的资源 ID 批量加载资源实体，不在节点执行阶段逐条查询。

## 4. 资源提取

将现有技能专用提取器升级为统一提取函数。资源不只来自 nodes，问题引导和 TTS 模型位于 chatConfig，因此函数必须接收完整工作流配置：

```ts
extractAppResources({ nodes, chatConfig }): AppResource[];
```

提取器只负责解析、归一化、合并、去重和稳定排序，不访问数据库和权限服务。

提取范围：

- `datasetSelectList`、`datasetParams` 等知识库配置；
- Agent `skills`；Skill 编辑调试使用的临时 `editSkillId` 不属于保存的 App 工作流，继续走非 App 调试的原有权限链路；
- 工作流节点直接引用的 `appModule` / `runApp` 记录为 `agent`；
- 个人工作流工具；
- Agent `selectedTools` 统一记录为 `tool`，包括被 Agent 选中的工作流 App 和插件工作流；
- MCP/HTTP 工具集及具体子工具；
- 节点中显式配置的模型；
- `chatConfig.questionGuide.model` 和 `chatConfig.ttsConfig.model`。

模型统计采用以下口径：

- `aiModel` 记录为 `modelType: 'llm'`；
- 启用查询扩展或深度搜索时，对应模型记录为 `modelType: 'llm'`；
- 启用 Rerank 时，`datasetSearchRerankModel` 记录为 `modelType: 'rerank'`；
- 开启问题引导且显式配置模型时，记录为 `modelType: 'llm'`；
- TTS 类型为 `model` 且显式配置模型时，记录为 `modelType: 'tts'`；
- Whisper 当前没有 App 级模型 ID，使用系统默认 STT，不写入资源；
- 没有显式配置而使用系统默认模型的场景不固化到 Version，避免统计快照与实际可变的系统默认值不一致；
- `id` 保存模型配置的 canonical `model` key，不保存展示名称；迁移遇到无法解析的历史模型值时保留原值，不阻断资源迁移；
- 模型展示名称和当前可用状态在查询时根据 `id + modelType` 解析，不冗余写入 Version；
- 模型不进入资源权限校验。
- 模型输入本身如果是动态引用，不写入静态模型资源；这类模型通过运行时用量统计覆盖，不参与 App 资源授权。

模型资源只记录 App/Version 配置中显式选择的模型。Dataset 的 `vectorModel`、`vlmModel` 随 Dataset 实体维护；需要统计一个应用的完整模型集合时，在读取 App.resources 的 dataset 后关联查询 Dataset 模型，不把 Dataset 自身配置复制到每条 App Version。默认 LLM、默认 Embedding、默认 VLM 和默认 STT 随系统配置变化，也不固化到 App Version。

动态资源 ID 无法在保存阶段确定时，不虚构资源记录。运行时必须保留输入是否来自引用的来源信息，不能只通过“资源是否命中快照”反推是否动态：

- 静态输入：必须命中当前 App Version 的 `resources`，未命中视为版本数据不一致并拒绝；
- 动态输入：按解析后的实际资源和 source 回退到现有运行身份鉴权；
- 回退使用当前运行入口已经确定的执行身份，不新增另一套身份选择规则；
- 不能对所有未命中资源自动回退人的权限，否则提取遗漏或节点篡改会绕过应用资源快照。

## 5. 写入链路

| 场景 | App Version | `apps` 工作副本 | `apps.resources` | 资源权限校验 |
| --- | --- | --- | --- | --- |
| 创建非文件夹 App | 创建首个正式记录并写入 resources | 写入 | 写入同一份 resources | 全量校验 |
| 自动保存 | 覆盖自动保存记录并写入 resources | 写入 | 不更新 | 全量校验 |
| 普通保存 | 创建非正式记录并写入 resources | 写入 | 不更新 | 全量校验 |
| 正式发布 | 创建正式记录并写入 resources | 写入 | 写入同一份 resources | 全量校验 |
| `/core/app/update` | 不写 Version | 按现有接口更新 | 不更新 | 传入工作流字段时全量校验 |
| 原地类型转换 | 沿用转换前保存结果 | 按现有逻辑转换 | 不更新 | 不新增校验 |
| MCP/HTTP 工具集更新 | 原地更新单条物理记录 | 原地更新 | 保持空资源 | 沿用 Manage 权限 |

### 5.1 创建、保存和正式发布

创建非文件夹 App、自动保存、普通保存和正式发布统一执行：

```text
normalizeWorkflowConfig
  -> beforeUpdateAppFormat
  -> extractAppResources
  -> checkAppResourceReadPermissions
  -> transaction 写入 Version.resources
  -> 正式发布时同步 App.resources
```

当前操作人必须对全部 `agent`、`tool`、`dataset` 和 `skill` 静态资源具有读取权限。每次保存都全量重新校验，不计算增量，也不复用 App 已发布授权替代操作人的权限。任一资源无权限时整个操作失败，不能静默删除无权限资源。

`model` 只记录，不参与该权限检查。

### 5.2 自动保存和普通保存

自动保存和普通保存继续写入完整 Version，因此从同一份 nodes 生成并写入 Version 自己的 `resources`。

它们不更新 `apps.resources`，但必须对当前操作人全量校验静态资源权限。缺少任一资源权限时保存失败；自动保存失败沿用现有本地草稿和错误处理链路，不写入不完整的远端 Version。

### 5.3 `/api/core/app/update`

`UpdateAppBodySchema` 已明确支持 nodes、edges 和 chatConfig，该接口继续承担更新 App 工作副本的职责。

它不创建或修改 App Version，也不更新 `apps.resources`。请求包含 nodes、edges 或 chatConfig 时，对规范化后的完整工作流执行资源提取和当前操作人的全量权限校验；只更新名称、头像、介绍或移动位置时不触发资源校验。

该接口不能为了资源快照去改写自动保存 Version 或当前正式发布缓存。

### 5.4 类型转换

保留当前流程：编辑器先保存工作副本，再调用 `transitionWorkflow`。原地转换继续修改 App 类型并规范化工作副本；创建副本继续复用 App 创建流程。

原地转换不创建正式 Version，也不更新 `apps.resources`。后续正式发布时再生成对应 Version 的资源事实和 App 发布缓存。

### 5.5 MCP/HTTP 工具集

MCP/HTTP 工具集没有面向用户的草稿、发布和历史版本能力。创建时生成的一条 `app_versions` 记录只是复用现有运行读取结构，不代表产品层版本历史。

更新时继续在同一 transaction 中原地更新：

```text
apps.modules
app_versions.nodes
```

不新增 Version，不增加发布按钮，不改变 `getAppLatestVersion` 的版本选择。工具集自身的固定配置节点不引用 Agent、Tool、Dataset 或 Skill，因此自身的 `resources` 为 `[]`，更新接口无需额外引入资源权限链路。

MCP/HTTP 仍然是资源权限快照中的 `tool`。当其他 App 引用它时，调用方 Version 保存：

```ts
{
  type: 'tool',
  id: 'toolsetAppId',
  data: {
    toolNames: ['search']
  }
}
```

## 6. 保存权限校验与授权时点

统一批量校验函数：

```ts
checkAppResourceReadPermissions({
  resources,
  tmbId,
  isRoot
});
```

权限映射：

- `agent`：使用现有 App 读取权限；
- `tool`：个人工作流工具和 MCP/HTTP 工具集均使用现有 App 读取权限；
- `dataset`：使用现有知识库读取权限；
- `skill`：使用现有 Skill 读取权限；
- `model`：跳过资源权限校验；
- root、团队边界、继承权限和资源删除状态复用现有 auth 服务。

该函数不会创建新的 `PerResourceTypeEnum`，因为 Agent/Tool 本质上复用 App 权限资源，Dataset 和 Skill 也已有各自权限模型。根据 `add-permission` 规范，本需求是在发布阶段组合已有权限资源，不是引入新的协作者资源类型。

校验只授权当前 App Version，不复制被引用资源的 ACL，也不修改其 owner、协作者或继承关系。

应用资源权限以正式发布时为准：

- 正式 Version 发布成功后，其 `resources` 是该版本持续有效的应用授权；
- 发布者或其他协作者之后失去个人资源权限，不影响已经发布的 Version 运行；
- 后续任何人再次保存或发布时，仍需使用该操作人当前权限全量校验所有静态资源；
- 被引用资源被删除、跨团队迁移、实体失效或配置不可用时仍然运行失败；
- 第一阶段不向 `resource_permissions` 增加 App 协作者主体，因此资源 owner 不能通过删除某条 App ACL 单独撤销授权。撤销方式是更新并重新发布引用方 App，或删除/停用被引用资源。

这是发布版本的授权快照语义，不是把某个发布者的个人权限结果缓存到运行时。

## 7. 运行时资源上下文

### 7.1 初始化

`getAppLatestVersion` 和 `getAppVersionById` 返回同一条 Version 的完整运行事实：

```ts
{
  versionId,
  versionName,
  nodes,
  edges,
  chatConfig,
  resources
}
```

正式 Chat、OutLink、v1/v2 API、定时任务、嵌套 App 和工具运行入口，把选中 Version 的 `resources` 显式传入请求级 Workflow Context。

入口只做一次批量资源加载：按 `resources` 中的 ID 和当前工作流 `teamId` 分类型执行 `$in` 查询，得到同团队的 App、Dataset、Skill 实体，再把声明列表和实体 Map 一起放进只读 Workflow Context。静态节点执行优先复用 Context 中的实体；只有动态资源才按解析后的实际 ID 走运行人权限和必要的实体查询。

```text
selected Version.resources
  -> group ids by resource type
  -> Mongo query with _id: { $in: ids }
  -> validate team / entity existence
  -> Workflow Context resourceMap + entityMap
  -> dispatch nodes
```

Dispatcher 和节点执行器不得根据 `appId` 再读取 `apps.resources`，也不得为每个节点重复查询静态资源；否则显式版本运行可能混用最新发布缓存或产生 N+1 查询。系统 Skill 也必须在入口批量实体查询中保留，不能因为没有普通团队 `teamId` 而漏掉。

### 7.2 运行判断

资源上下文按 `type:id` 建立只读 Map（模型额外包含 `modelType`）：

- Dataset、Skill、Agent：要求对应资源存在；
- 个人工具：要求 `tool:appId` 存在；
- Agent `selectedTools` 中的工作流 App/插件：同样要求 `tool:appId` 存在；
- MCP/HTTP：要求 `tool:parentAppId` 存在，并按 `toolNames` 检查子工具；
- Model：不做资源权限判断；
- 系统工具和商业工具：继续走现有系统逻辑。

静态资源未出现在当前 App 资源上下文时拒绝执行，不能因为当前运行人恰好拥有资源权限而绕过发布快照。只有输入来源被明确标记为动态引用时，才按解析出的资源 source 回退现有运行身份鉴权。

通过快照检查后仍需读取资源实体、运行配置和工具定义；资源不存在、已删除或配置无效时继续按原错误链路失败。资源快照替代的是个人读取权限，不是实体存在性检查。

### 7.3 知识库 `authTmbId`

保留知识库节点已有的终端用户过滤：

- 资源必须先存在于当前 App Version 的 `resources`；
- `authTmbId: false` 时按配置知识库执行；
- `authTmbId: true` 时继续按当前终端用户权限过滤；
- App 发布资源授权和终端用户数据过滤是两层不同职责。

因此资源快照不能删除或短路现有 `authTmbId` 行为。

### 7.4 嵌套 App 和工具

父 App 只保存直接引用：

1. 父 Version 先通过 `agent` 或 `tool` 资源检查；
2. 加载子 App 指定 Version，未指定时沿用当前最新正式 Version；
3. 子 App 执行时切换为子 Version 自己的 `resources`；
4. 子 App 不继承父 App 的资源上下文。

MCP/HTTP 工具集作为 `tool` 被父 Version 授权；工具集自身运行时使用自己的空资源上下文，不创建新的版本语义。

### 7.5 Debug 和 Test

Debug/Test 执行请求中的编辑器节点，不对应某条正式 Version，因此不能读取最新发布资源缓存。

入口必须以服务端收到的 nodes 和 chatConfig 为准，按资源 source 对当前操作人执行完整鉴权，然后再创建临时资源上下文：

```text
request nodes + chatConfig
  -> normalize and extract resources
  -> validate current operator by source
  -> temporary Workflow Context
  -> dispatch
```

source 规则：

- Agent：对目标 App 检查当前操作人的读取权限；
- Personal Tool：对工具 App 检查当前操作人的读取权限；
- MCP/HTTP：解析父工具集 App ID，对父 App 检查当前操作人的读取权限；
- Dataset：检查当前操作人的知识库读取权限；
- Team Skill：检查当前操作人的 Skill 读取权限，系统 Skill 按现有规则放行；
- System Tool 和历史 Community Tool：没有资源 ACL，不做资源权限检查；
- Commercial Tool：不做 App 资源权限检查，继续执行现有商业工具可用性校验；
- Model：不做资源权限检查，继续执行现有模型存在性和可用性逻辑；
- 动态资源：解析实际值后按相同 source 规则检查当前操作人。

Test/Debug 不复用 App 已发布 Version 的授权，也不能接收客户端提交的 `resources`。即使调用人有当前 App 的读取权限，只要缺少请求节点引用资源的个人权限，本次 Test/Debug 就失败。

非 App 来源的 Skill 编辑调试等场景继续使用原有权限逻辑，不强制套用 App 资源上下文。

### 7.6 Sandbox Skill

正式 App 运行 Skill 时，将当前 Version 的 `skill` 资源随已有 Sandbox 运行参数传入。Sandbox 根据资源上下文允许加载对应 Skill，不再按 App 运行人的个人 Skill 权限决定。

这只扩展资源授权数据，不改变 Sandbox 的进程隔离、文件系统或网络策略。

## 8. 版本与历史数据

正式 Version 继续按当前 `{ appId, isPublish: true }` 和 `{ time: -1 }` 选择，不新增 `publishedVersionId`，不改变 `pluginData.nodeVersion` 的现有用途。

历史 App 没有正式 Version 时，保留 `getAppLatestVersion` 回退到 `apps.modules / edges / chatConfig` 的行为，并在这条回退路径中用当前工作副本重新提取 `resources`。这样普通保存虽然不更新 `apps.resources`，也不会让新 modules 继续使用旧资源快照；迁移脚本回填的 `apps.resources` 只用于反查和历史缓存，不作为运行时授权事实。

该路径只是历史数据兜底。所有新建非文件夹 App 仍应生成首个正式 Version。

## 9. 资源反查与统计

资源反查查询 `apps.resources`，因为它代表当前正式发布版本；不能直接匹配所有历史 App Versions，否则已经从最新版本删除的资源仍会被统计。

Skill 引用示例：

```ts
{
  resources: {
    $elemMatch: {
      type: 'skill',
      id: skillId
    }
  }
}
```

Tool、Agent、Dataset 和 Model 后续存在真实反查需求时复用同一查询结构。

## 10. 数据迁移

迁移脚本是切换到 `resources` 的前置步骤，必须幂等、分页并支持 `dryRun`：

1. 扫描所有 `app_versions`，根据各自 nodes 使用统一提取器生成 `resources`；
2. 同时读取每条 Version 的 chatConfig，补齐问题引导和 TTS 等显式模型资源；
3. 将旧 `resourceRefs.skillIds` 作为审计输入，与节点提取结果核对；
4. 对每个 App 读取最新正式 Version，将对应 `resources` 写入 `apps.resources`；
5. 没有正式 Version 的历史 App，根据 `apps.modules + chatConfig` 回填 `apps.resources`，但不创建 Version；运行时仍以当前工作副本重新提取的资源为准；
6. 历史正式 Version 无法还原当时的发布者权限，迁移时信任已经持久化的正式配置，将其视为升级前已授权资源，保证升级后运行连续性；
7. dry-run 输出扫描数量、旧 Skill 引用数量、旧引用与节点提取结果的差异数量和资源生成结果；无法静态提取的动态引用继续按运行时 source 规则处理；
8. 校验 Version 资源、App 最新发布缓存、旧 Skill 引用数量和差异数量；
9. 从 Apps 和 App Versions 中 `$unset resourceRefs`；
10. 将旧 `resourceRefs.skillIds` 索引声明为 deprecated，并由索引管理器精确清理；
11. 新业务代码只保留 `resources`，不提供旧字段兼容分支。

迁移脚本必须复用线上 `extractAppResources`，不能复制另一套解析规则。

## 11. 一致性约束

- App Version 的 nodes 和 `resources` 必须来自同一次提取；
- `apps.resources` 代表最新正式发布 Version；历史无 Version App 只将其作为迁移/反查缓存，运行时从当前工作副本重新提取资源；
- 创建、自动保存、普通保存、正式发布和带工作流字段的 `update.ts` 都要全量校验当前操作人的静态资源权限；
- 普通保存、自动保存、`update.ts` 和原地类型转换不得更新 `apps.resources`；
- 正式运行必须使用实际选中 Version 的 `resources`；
- 已发布 Version 以发布时权限为准，不受发布者后续个人权限变化影响；
- Test/Debug 必须按资源 source 完整校验当前操作人，不能复用 App 发布授权；
- 动态资源只能在明确保留动态来源信息时回退现有运行身份鉴权；
- Tool 必须进入资源权限快照，MCP/HTTP 使用父 App ID 和可选 `toolNames`；
- `resourceRefs` 只用于迁移输入，迁移后从数据、字段 Schema、查询和业务代码中删除；旧索引通过 deprecated 声明交给索引管理器清理；
- `authTmbId`、App 入口权限、资源实体检查和团队边界保持原样；
- MCP/HTTP 更新继续原地修改单条物理记录，不新增产品版本能力。

## 12. 实施 TODO

- [x] 定义 `AppResource`、资源类型和 `AppResourcesSchema`。
- [x] 将 App、App Version、OpenAPI 和响应类型从 `resourceRefs` 切换到 `resources`。
- [x] 实现并测试统一资源提取器及工具 ID 归一化。
- [x] 覆盖 Tool、Agent、Dataset、Skill 和 Model 提取规则。
- [x] 实现创建、自动保存、普通保存、正式发布和带工作流字段更新的全量资源权限校验。
- [x] 实现 Test/Debug 按 Tool/Agent/Dataset/Skill source 对当前操作人的完整鉴权。
- [x] 保持普通保存、自动保存与 App 最新发布缓存的写入边界。
- [x] 让 Version 读取函数返回 `resources`，并由运行入口显式初始化 Workflow Context。
- [x] 改造子 App、个人工具、MCP/HTTP、知识库和 Skill 的运行时资源检查。
- [x] 保留知识库 `authTmbId` 和非 App 调试场景的既有逻辑。
- [x] 保持 `update.ts`、`transitionWorkflow` 和 MCP/HTTP 更新的现有职责。
- [x] 将 Skill 统计迁移到 `apps.resources` 的 `$elemMatch` 查询。
- [x] 编写迁移脚本、dry-run 审计和旧索引清理声明。
- [ ] 覆盖发布后人员撤权、全量保存校验、Test/Debug source 鉴权和动态资源回退测试。
- [ ] 覆盖模型统计、嵌套 App、工具子项、历史回退和迁移测试。
