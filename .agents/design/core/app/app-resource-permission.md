# 应用工作流与资源快照

目标：Version 成为新代码读取工作流图和资源授权的唯一事实；App 上的旧工作流字段仅作为兼容和回滚依据保留，不再参与正常读写。`resources` 只写在 Version 上：缺字段时现场走与迁移相同的提取，`[]` 就是空快照。

相较上一版设计的关键变化：

- 资源快照只落 `app_versions.resources`，App 主表不存这份缓存；
- 取消「正式 Version 缺 `resources` 抛 `App resources are not migrated`」；
- 工作流图迁到 Version，App 只用 `publishedVersionId` 指向正式版；
- 保存/发布鉴权改为相对最新 Version 的增量校验（第 7 节）；
- 4163 迁移只回填 Version 和正式指针，不删除 App / Version 上的旧字段；
- `model` 与 App、知识库、Skill、工具一样进入标准资源鉴权，正式运行只校验当前 Version 的应用资源快照，不重新校验运行人的模型权限。

资源模型（`AppResource`、工具归一化、`toolNames`）见文末附录。

---

## 1. 数据落在哪

### 1.1 `app_versions`（唯一事实）

每条 Version 一次写入：`nodes / edges / chatConfig / resources`。

正式 Version 的 `resources` 必须和该条 nodes 同源。草稿（自动保存/普通保存）允许节点里出现尚未写入快照的新增引用，见第 7 节。

### 1.2 `apps`（资源行 + 指针，旧图只保留兼容副本）

留下：`name / avatar / intro / type / parentId / teamId / tmbId / permission 相关 / deleteTime / pluginData / scheduledTrigger*` 等。

增加（或复用现有指针）：

- `publishedVersionId`：当前最新正式 Version。反查、正式 Chat 选版都用它，避免扫全部历史正式版。
- 编辑器工作副本不保存 App 指针，每次按该 App 的 `time` 最新 Version 读取（含 `isAutoSave`）。

保留但废弃：

- `modules / edges / chatConfig`：保留已有数据并在 Schema 标记 deprecated；新代码仅在 App 没有正式 Version 的迁移窗口读取，不再写入。
- `resourceRefs`：保留已有数据并在 Schema 标记 deprecated；仅供旧版本兼容和迁移核对。

新建 App 不再主动写这些旧字段。文件夹没有工作流，不写 Version；历史文件夹已有的旧字段也不由本次迁移清理。

旧字段不是双写副本。只有“该 App 没有正式 Version”的迁移窗口允许正式运行读取旧图，同时迁移会把它作为一次性源数据补建正式 Version；已有草稿或自动保存 Version 不能替代旧代码实际运行的 App 图。正式 Version 建立后永久停止 fallback，避免两份事实长期漂移。

`pluginData.nodeVersion` 与 `publishedVersionId` 的职责不得混用：正式运行只看 `publishedVersionId`（或等价的最新正式 Version 查询），不看 `nodeVersion`。

---

## 2. 读路径

| 场景 | 读谁 |
| --- | --- |
| 正式 Chat / OutLink / MCP 调 App / 定时任务 | `publishedVersionId` 对应 Version；没有指针则 `isPublish: true` + `time: -1`；没有正式 Version 时在迁移窗口读取 App 旧图 |
| 子 App / 工具钉死 `versionId` | `getAppVersionById`，只读那一条 |
| 打开编辑器、复制工作流 | 该 App `time` 最新 Version（含 autoSave） |
| Skill/资源反查（哪些 App 在用） | 查 **当前正式 Version**：`_id ∈ publishedVersionId` 且 `resources.$elemMatch`。禁止对所有 `isPublish: true` 做 elemMatch，否则旧正式版会把已删引用算进去 |

Test/Debug：仍用请求体 nodes，服务端 `extract` + 按当前操作人鉴权，不读已发布快照，不接受客户端传 `resources`。

已有正式 Version 时不要用 `apps.modules` 补运行快照。不要用最新正式 Version 的 `resources` 去跑另一条 Version 的 nodes。

编辑器详情 `GET /core/app/detail`、创建 `POST /core/app/create`、画布和工具编辑都直接用 `nodes`，与 Version 同名。不要再把 Version.nodes 映射成 App.modules。`apps.modules` 只作为无正式 Version 迁移窗口的兼容读源、迁移源和回滚依据保留。

API 契约向后兼容：
- `CreateAppBodySchema` 主规范使用 `nodes`，同时保留 `@deprecated modules?: any[]` 并通过 `migrateCreateAppBodyWorkflow` 预处理自动映射归一化为 `nodes`，防止破坏已有前端调用方（如模板市场创建、JSON 导入等）而造成不必要的大范围级联修改。
- 兼容只覆盖创建输入；详情响应和 `AppDetailType` 只输出 `nodes`，不再暴露 `modules`。

应用列表的 `hasInteractiveNode`（评测选应用过滤表单输入 / 用户选择）只扫当前 `publishedVersionId` 对应 Version 的 `nodes`，不读 `apps.modules`。

---

## 3. 写路径

| 操作 | Version | App |
| --- | --- | --- |
| 自动保存 | upsert `isAutoSave: true`，写入图 + 增量后的 `resources` | 更新 `updateTime`；**不改** `publishedVersionId` |
| 普通保存 | insert 非正式 Version，图 + 增量后的 `resources` | 更新 `updateTime`；**不改** `publishedVersionId` |
| 保存并发布 | insert `isPublish: true`，图 + 完整 `resources`（新增无权限则整次失败） | 更新 `publishedVersionId`、定时触发等 |
| 创建非文件夹 App | 首条 `isPublish: true` | 设好 `publishedVersionId` |
| 原地类型转换 | 必须写 Version（upsert autoSave 或 insert 非正式），直接复制最新 Version 的 `resources` 快照，不按转化操作者重新校验或过滤 | 不存图 |
| MCP/HTTP 更新 | `updateOne` **`publishedVersionId` 对应的那条** Version 的 `nodes` + `resources: []`（无指针回退 draft/最新） | 不存图；无产品版本历史 |

保存/发布：`extractAppResources` → 相对上一版增量鉴权（第 7 节）→ 与 nodes 同事务写入。`model` 参与同一套增量鉴权。系统/商业工具不进快照。

原地类型转换是已有应用状态迁移，不属于普通保存：工作流转化写入的 autoSave Version 直接沿用转化前最新 Version 的 `resources` 快照，保持已确认的资源权限，不重新按当前操作者做宽松过滤。

普通保存/自动保存不得更新正式指针。

---

## 4. `resources` 怎么解析

对**当前这条 Version**：

| 存储 | 含义 | 行为 |
| --- | --- | --- |
| 字段不存在 / `null` / 非数组 | 未迁 | 与 4163 `buildResources` 相同：对该条 `nodes + chatConfig` 做 `extractAppResources`；若仍有 `resourceRefs.skillIds` 则 merge |
| `[]` | 已迁或已保存，明确无引用 | 空快照，不再从 nodes 提取 |
| 合法非空数组 | 已有快照 | `safeParse` 后直接用 |
| 数组结构非法（`safeParse` 失败） | 视同缺字段 | 回退到该条 `nodes + chatConfig` 的 `extractAppResources`，避免单条脏数据炸链路；代价是可能重新纳入快照原本排除的引用 |

不要抛 `App resources are not migrated`。
不要把缺字段当成 `[]`。

历史模型资源可能仍包含 `data.modelType`。新 `AppResourceSchema` 应兼容解析并忽略该额外字段，归一化为 `{ type: 'model', id }`；不要求为了删除该字段单独重写历史 Version。

允许读时懒回写 `$set.resources`，避免每次 extract。当前决定仍由 4163 批量回填；本次不做懒回写，也不 `$unset resourceRefs`。

空数组与缺字段必须区分：不引任何资源的应用保存后就是 `[]`。

---

## 5. 运行时授权

- **不再区分运行态静态与动态输入**：移除 `isWorkflowNodeResourceDynamic` 与各节点的 `dynamic*` 参数，五类资源（`model` / `dataset` / `skill` / `tool` / `agent`）在具体执行的节点内统一按同一套规则处理：
  - **命中当前 `WorkflowResourceContext`（`hasWorkflowResource`）**：直接走应用资源快照授权，不校验运行人个人权限；随后实时加载实体（`MongoApp.findOne` / `MongoDataset.findOne` / `MongoAgentSkills.find` / `ModelHandle`），若实体已被删除或不可用则抛出领域异常（`WorkflowResourceError` / `DatasetErrEnum.unExist` / `SkillErrEnum.unExist` / `ModelConfigError`）。
  - **未命中 `WorkflowResourceContext`（或无快照上下文）**：直接回退按当前运行人（`tmbId`）权限校验与加载（`assertAuthModels(use)` / `authDatasetByTmbId` / `filterDatasetsByTmbId` / `authAppByTmbId` / `authSkillByTmbId`）。
- 模型快照只替代“人的模型权限”判断，不替代模型有效性判断。模型被删除、停用或类型不匹配时，仍在实际使用节点抛出模型不可用错误。
- 父子不共享快照：父先过 `agent/tool`，子用子 Version 自己的 `resources`。系统工具（commercial）通过 `createSystemToolResourceContext({ nodes, chatConfig })` 提取内部静态资源写入快照，且标记 `trusted: true` 跳过跨团队限制；未命中快照的资源仍按运行人鉴权。
- 系统 Skill 放行；MCP/HTTP 用父工具集 id + 可选 `toolNames`。
- `authTmbId` 仍是终端用户数据过滤，和发布快照是两层。
- **纯 JIT 实时查库，入口零 DB 查询**：入口 `createWorkflowResourceContext`（原 `loadWorkflowResourceContext`，已改为同步）仅在内存中把快照转为白名单字典 `resourceMap`（耗时 ~0ms），彻底移除开局批量查库逻辑（不再生成 `appMap`、`workflowMap`、`datasetMap`、`skillMap` 等内存实体大字典）；root Test/Debug 请求保留跨团队标识向下传递 `isRoot`。
- **现场核验与单点按需查库**：实体不在入口预取，只有流转到实际使用节点时，才在节点内调用 `loadWorkflowModelResource` / `loadWorkflowDatasetResource` / `loadWorkflowAppResource` / `loadChildWorkflowWithResource` / `injectAgentSkillFilesToSandbox` 核对 `hasWorkflowResource` 并实时加载。未命中的分支和未调用的工具整个运行周期零 DB 查询、零开销。
- 缺失/软删/跨团队**在命中节点按需抛错**：查库未找到实体或软删时，抛出 `WorkflowResourceError` 或领域异常，其余未执行的分支不受影响。任何资源加载器都不得把“已声明但实体缺失”降级为静默跳过。编辑器通过 workflow check 标出失效引用并定位到节点（`resource_missing`）。

---

## 6. 迁移

本节只约束本设计中的 App 资源迁移，不改变注册表中其他已发布系统迁移的既有语义。该迁移以 `20260916_backfill_app_resource_snapshots` 作为永久任务 ID、首次发布版本为 4.17.1，并作为新的只回填任务追加到注册表末尾，不能修改已经发布任务。

### 6.1 4163（资源）

- 已有 Version：按该条 nodes 提取并写入 `resources`（逻辑与运行时缺字段相同）。
- 有正式 Version：不要用 App.modules 覆盖该 Version 的 nodes。
- 给仍在用的 App 补 `publishedVersionId`（最新 `isPublish: true`）。
- 正式指针回填使用 compare-and-set：只在扫描时读取的 `publishedVersionId` 未变化时写入，避免覆盖并发发布。
- 保留 App / Version 上已有的 `resourceRefs`、`modules`、`edges`、`chatConfig`，迁移不执行任何 `$unset` 或旧记录删除。
- 已有合法 `resources` 直接跳过；迁移只回填缺失或结构非法的快照，重复执行不会改变已迁 Version 和旧字段。
- 历史 Version 与 App 表回填快照时，统一按应用所有者 `app.tmbId` 执行静默权限校验：操作人无读取权限的资源直接从 `resources` 快照中静默剔除（保持在 nodes 中），不报错、不中断迁移流水线；若关联 App 不存在或无法查到有效成员信息（如成员已离职或不存在），作为迁移失败记录追踪。实体缺失或停用仍由编辑器提示和运行时按需报错。

### 6.2 补正式 Version

- `app_versions` 里该 `appId` **没有 `isPublish: true` 的记录**：用 App 的 `modules/edges/chatConfig` 建一条正式 Version，并写出 `resources`、`publishedVersionId`。
- 已有草稿或 autoSave Version 时保留原记录，不覆盖、不提升为正式版；新建的正式 Version 仍以旧代码实际运行的 App 图为源。
- 已有正式 Version 时不把 App 图拷进 Version，只回填或修复 `publishedVersionId`。

### 6.3 保留旧字段并在 Schema 废弃

1. 补 Version + 4163 完成。
2. 读路径全部改到 Version。
3. 写路径不再写 App 旧图字段。
4. 持久化兼容 Schema 保留 `modules / edges / chatConfig / resourceRefs`：Mongoose / TypeScript 定义使用 `@deprecated`，需要 Zod 兼容解析时使用 `.meta({ deprecated: true })`；新业务 DTO 和 OpenAPI 不再暴露这些字段。
5. 本次不删除旧字段、不删除旧记录，也不登记旧字段索引为 deprecated。索引与数据清理必须等兼容和回滚窗口结束后，通过独立设计和独立迁移执行。

**MCP/HTTP**：已有 Version，不新建、不覆盖；最多校验与旧 `apps.modules` 是否一致。

**类型转换**：必须写 Version；旧 App 图虽然保留，但不能继续作为转换结果的事实来源。

### 6.4 自动迁移执行契约

- 恢复策略使用分批断点续跑。App 和 Version 数量没有固定上界，分别按不可变 ObjectId `_id` 固定扫描上界并推进游标；每批使用全局 `SYSTEM_MIGRATION_BATCH_SIZE`，内存只保留当前批次和有限状态。
- 阶段固定为 `versions`、`apps`、`validation`。任务位于当前注册表末尾，依赖此前的模型引用迁移先补齐工作流 `modelId`，再从 Version 工作流生成完整资源快照。
- 任务非阻塞启动并使用 `onFailure: continue`。新版本对缺失 `resources` 保留运行时提取兼容，对没有正式 Version 的 App 临时读取旧图；旧版本仍可读取保留的 App 图和 `resourceRefs`，因此任务失败不影响节点 readiness，也不要求停机升级。
- Version 快照使用读取字段 compare-and-set，只在该 Version 的 `nodes/edges/chatConfig/resourceRefs/resources` 未变化时回填；已有合法快照保持不变。批次重放会再次计算同一确定性结果，不产生额外记录。
- App 正式指针只在扫描时读取的 `publishedVersionId` 未变化时回填。无正式 Version App 的补 Version 与指针写入在同一 Mongo 事务内完成，并在事务内再次确认仍无正式 Version，避免业务并发发布或进程退出留下孤立迁移版本；已有草稿不影响补建。
- 非阻塞失败记录只保存 `appId` 或 `versionId`、阶段和截断后的原始原因。重试时先重放上次失败记录，完整错误快照持久化成功后才推进对应 checkpoint。
- 主快照完成后尾扫新增记录；最终校验全部 Version 均有合法 `resources`，所有非文件夹 App 均有正式 Version，且正式指针指向自身 Version。仍有异常时任务保持 failed，管理员修复数据后重试。
- checkpoint 只保存各阶段固定上界、最后完成游标、进度计数和完成标志。业务写入成功但 checkpoint 前退出时，重放会跳过已完成写入，因此最终结果只返回可稳定恢复的扫描计数，不展示无法精确恢复的更新计数。
- 成功结果不写 i18n key、业务正文或完整错误栈。

## 7. 保存增量鉴权

动机：协作编辑时，上一版已经授权的资源不应要求当前保存人再具备读权限；否则改一句提示词也会被已撤权的知识库挡住。

比较基准统一为 **该 App `time` 最新 Version**（含自动保存记录）。已有合法快照直接使用；缺 `resources` 时按第 4 节 extract 并执行与 6.1 节迁移一致的静默权限过滤（按应用所有者 `app.tmbId` 过滤）得到 baseline，防止历史未迁移草稿中的未授权引用被误判为 `kept` 从而绕过鉴权并固化到快照中。

```text
extracted = extractAppResources(nodes, chatConfig)
baseline  = 最新 Version 的 resources
added     = extracted 相对 baseline 的新增（所有资源统一按 type + id）
kept      = extracted 中已在 baseline 出现的部分（不重新鉴权）
```

- 已在 baseline 中的资源：直接进入本版 `resources`。节点里删掉的引用不再保留。
- 新增资源：按当前操作人做读权限校验。
- 新增 `model`：先通过现有 typed model getter 校验模型存在、启用且符合调用点要求的类型，再按当前操作人的模型读权限校验。模型 ACL 的数据库权限主体仍是成员、组、组织；App 的正式使用权由 Version 快照表达，不给 `resource_permissions` 新增 `appId` 主体。
- 创建 App（无上一版）视为全部新增，全量校验。
- Test/Debug 仍使用请求体 nodes 生成运行时资源上下文；主应用先按当前操作人校验，工作流资源只校验相对 draft baseline 的新增部分。已在草稿快照中的资源不重复校验当前操作人。

### 7.1 自动保存 / 普通保存：不阻断

节点原样写入。`resources` 只收录：

- `kept`（上一版已有，即使当前用户已无读权限）
- `added` 里当前用户**有**读权限的部分

无权限的新增引用留在 nodes 里，不写入 `resources`，保存成功。草稿允许 `nodes` 比 `resources` 多。

- 指向**已删除/不存在**实体的新增引用与无权限同口径：保存/自动保存不阻断，丢弃出 `resources`、留在 nodes；发布时被 §7.2 阻断。
- 编辑器对快照外新增引用的无权限资源标记 `error: 'resource_no_permission'`，在 workflow check 中标出并定位到错误节点；已删除/不可用资源通过 `error: 'resource_missing'` 定位。进入工作流编辑器时延迟执行 `scheduleEntryCheck`，若存在错误节点自动 `fitView` 定位并高亮该节点。
- `kept`（已在 baseline 里的资源）不做存在性检查、不重验权限：引用从节点移除后 extract 自然不再产出，本版 `resources` 自动剔除；被删引用由编辑器轮询 / workflow check 标出并定位，提示用户移除节点。

### 7.2 保存并发布：阻断

相对保存开始时读取到的最新 Version 做增量。`added` 里任一无权限（含已删除/不存在，`unExist`），**整次发布失败**，指出缺权限的资源，不写正式 Version，不改 `publishedVersionId`。

全部新增都有权限时，写入的 `resources = kept + added`，与本次 nodes 同源。正式 Chat 只跑这类 Version。

含义：协作者可以把 owner 已经写进草稿快照的资源发布出去（相对 draft 不算新增）；自己新加、自己没权限的资源过不了发布。

模型同样遵循该规则：协作者失去某模型的个人权限后，仍可保存和发布已经存在于 baseline 的模型；新加入的模型必须由当前操作人拥有权限。

### 7.3 模型校验边界

- `formatModels` 负责在写入/导入/调试边界（保存 `create.ts`、发布 `publish.ts`、模板解析 `appTemplateParse.ts`、调试 `prepareAppWorkflowResources`）将 legacy `model` 归一化为 canonical `modelId`、在 `preserve` 与 `validate` 模式下为已开启但留空的可选模型槽位物化默认 `modelId`，并在 `validate` 模式下校验模型存在性、启用状态和类型。调用方统一传入 `modelHandle.getActiveModels()`，不能先按当前成员权限过滤，否则 baseline 中已有模型会被错误阻断。
- **团队模型与系统模型的兼容/回退边界**：显式 `modelId` 校验同时支持系统模型与团队模型；但旧 `model` 名称兼容提取（含跨环境 JSON 导入导出）以及默认模型回退（`defaultModelIds` 与同类型候选兜底）均通过 `isSystemModel` 严格限制为系统模型，绝不匹配或回退到团队模型。
- `extractAppResources` 提取已开启槽位的静态 canonical `*ModelId`，排除引用输入与 `{{...}}` 模板表达式。当 `modelId` 为 `undefined` 且存在 legacy `model` 时，通过进程内缓存的系统模型目录按名称和类型解析为 ID；不匹配团队模型，未命中目录时不生成模型资源。提取只声明资源，后续仍按快照基线或成员权限鉴权。
- `resolveAppResourcesByPermission` 把 `model` 纳入 `added / kept`，新增模型通过现有 `PerResourceTypeEnum.model` 权限数据和 `getAuthorizedModelIds` 校验。
- `modelId` 已唯一标识 `ai_models` 实体，资源快照统一存 `{ type: 'model', id: modelId }`，不再保存 `modelType`。模型类型仍由提取位置和 `handle.getModelData(..., { type })` 校验，不进入资源身份。
- 统一遵循“引用解析为实际模型 ID 后鉴权”原则，legacy `model` 不享有免鉴权豁免：
  - 工作流各模型消费节点（`dispatchChatCompletion`、`classifyQuestion`、`extract`、`toolcall`、`queryExternsion`、`agent`、`dataset/search`、`agent/sub/dataset`）统一调用 `loadWorkflowModelResource`：通过 `handle.getModelData(..., { type })` 解析模型定义，并按实际模型 ID 检查 `hasWorkflowResource`——命中快照直接放行，未命中快照按运行人 `assertAuthModels(use)` 校验。历史仅含 legacy `model` 的节点只在系统模型内解析名称，仍遵循同一授权规则。可选槽位传 `fallbackToDefault: true` 时，仅对 `isModelConfigError` 在运行人有权限的系统模型内回退默认模型，无可用默认时返回 `undefined`；权限错误不降级。
  - `createQuestionGuide`、`getSpeech`（TTS）等独立于 Workflow dispatcher 的 App 辅助入口，显式 `modelId` 或 legacy `model` 都先解析，再以实际模型 ID 调用 `authTargetModelResource` 走应用快照校验（命中正式 Version `resources` 直接放行；登录成员 Test/Debug 未命中时按 `resolveAppResourcesByPermission` 校验草稿基线与新增资源；外链 / API Key 只认正式 Version）。问题引导未配置模型时，通过 `getAuthorizedModelIds` 和 `handle.getDefaultModelData('llm', { authorizedIds })` 选择有权限的系统模型；TTS 仍要求模型引用和 voice。
- Test / Debug（`prepareAppWorkflowResources`）先对请求体执行 `formatModels(preserve)` 将 legacy `model` 归一化为 `modelId`，已开启空槽位使用 `modelHandle.getDefaultModelIds(authorizedIds)` 提供的授权系统默认 ID。返回授权后的资源列表，由 Test/Debug 入口构建临时资源上下文：baseline 内模型沿用 App 已有授权，新增模型按当前操作人校验。
- 未命中快照的模型或无 App 快照场景使用 `assertAuthModels(use)` 按运行人校验 `modelId`，并由 typed getter 校验模型存在、启用和类型。
- App 辅助入口收到客户端 `modelId` 或 legacy `model` 时，服务端不得仅信任请求值：解析后命中正式 Version 快照直接放行；未命中时仅登录成员可走草稿基线与新增权限校验，外链 / API Key 直接拒绝；非 App 来源按当前运行人权限校验。
- 当前 App 直接提取的模型来源仍是 LLM、rerank、TTS 等已有静态 `modelId` 入口。Embedding 模型属于 Dataset 自身配置，STT 当前没有 App 静态 `modelId`，不在本次提取范围；未来新增直接选择入口时只需让提取器产出同一种 `{ type: 'model', id }` 资源，不扩展资源 Schema。

### 7.4 `toolNames` 不是权限层

本分支之前，MCP/HTTP 只对**父工具集 App** 做读权限，没有按子工具名鉴权。本方案不新增这一层。

增量 `added` 只按 `type + id`。父工具集已在 baseline 时，再勾子工具或改成整包都不触发鉴权。`toolNames` 随本次 extract 写入，只表示这版图选了哪些子工具，不是独立 ACL。

运行时展开整个工具集时，按快照中的 `toolNames` 裁剪子工具列表。读取或执行单个子工具时，`loadWorkflowAppResource` 按具体 `toolName` 判断：命中快照沿用发布授权，未命中则检查运行成员的父工具集读权限；通过后直接读取完整定义，不再按快照重复裁剪。单工具 Schema 补齐只读取定义，具体子工具授权在执行入口完成。

新拖进一个尚未在 baseline 里的工具集：算 `tool` id 新增，保存/发布按 7.1 / 7.2 对该父 App 做读权限校验。

---

## 8. 反查

Skill 列表 appCount、Skill 详情「被哪些 App 引用」：

```text
apps: { _id, publishedVersionId, teamId, deleteTime }
join / $in publishedVersionId
app_versions.resources $elemMatch { type, id }
```

不要：`app_versions.find({ isPublish: true, resources: $elemMatch })` 再 distinct appId。

索引：

- App：`{ teamId: 1, deleteTime: 1, publishedVersionId: 1 }`
- Version：现有 `{ appId: 1, time: -1 }`；另有 `{ appId, resources.type, resources.id }` 供 Version 自身资源查询
- 历史 `{ teamId, deleteTime, resourceRefs.skillIds }` 暂时保留，兼容窗口结束前不登记为 deprecated

---

## 9. 落地顺序

1. **读容错**：`getAppLatestVersion` / `getAppVersionById` 对缺 `resources` 改为 extract，去掉该错误码；`[]` 保持空。
2. **指针**：发布/创建写入 `publishedVersionId`；4163 回填。
3. **反查改查正式 Version**。
4. **无正式 Version App 补建正式 Version**。
5. 编辑器/复制/Chat 回退改读 Version；类型转换/MCP 更新只写 Version。
6. 旧 App 图和 `resourceRefs` 停止读写并在 Schema 标记 deprecated，但保留原数据。
7. 将 `model` 纳入增量资源鉴权，并在所有模型运行入口接入静态快照 / 动态运行人校验。

第 1 步可先于迁移上线，聊天不必等 4163 跑完。旧字段不清理，因此滚动升级和回滚期间旧节点仍可读取原数据；新节点始终以 Version 为准。

增量鉴权（第 7 节）与保存接口同一批改。编辑器读取和保存基准均按最新 Version 计算，不再维护草稿指针；4163 只回填正式 Version 指针。

---

## 10. 明确不做的事

- 用最新正式 Version 的 `resources` 去跑另一条 Version 的 nodes
- 用 App 工作副本给正式 Chat 授权
- 普通保存/自动保存更新「正式」指针
- 缺 `resources` 当 `[]`
- 把有 Version 的 App 的 `modules` 盖到正式 Version 上
- 对所有历史 `isPublish: true` 做资源反查
- 按 MCP/HTTP 子工具名做读权限（与改之前一致，权限只打到父工具集 App）
- 在 4163 中 `$unset` 或删除 App / Version 的旧字段
- 给 `resource_permissions` 增加 App 协作者主体；App 对静态模型的使用权由当前正式 Version 的 `resources` 快照表达
- 正式运行时按对话人、App owner 或发布人的模型权限重新鉴权

---

## 11. 已确认决策

1. 读时懒回写 `resources` 本次不做。4163 批量回填即可；运行时缺字段每次 extract。
2. `pluginData.nodeVersion` 继续写，仅给工具/子 App 钉版本用。正式运行只看 `publishedVersionId`。
3. 4163 只回填，不清理旧表字段；旧字段在 Schema 标记 deprecated 并保留回滚能力。
4. `model` 是标准 ACL 资源。发布前按操作人授权，发布后以 Version 快照作为 App 权限，不再校验人的模型权限。
5. `model` 与其他资源统一按 `type + id` 标识；快照不保存 `modelType`，模型类型由模型实体和具体调用点的 typed getter 校验。
6. API 契约向后兼容：`CreateAppBodySchema` 保留对 `modules` 创建输入的兼容解析；详情响应和 `AppDetailType` 统一使用 `nodes`，不继续输出旧字段。
7. 资源无权限与已删除严格区分：编辑器与工作流校验统一使用 `error` 状态并独立报出 `resource_no_permission`，配合工作流加载时的 `scheduleEntryCheck` 自动定位（`fitView`）至错误节点，与已删除实体的 `resource_missing` 区分对待。
8. 技能目录权限继承：技能资源列表（`listReadableAgentSkills`）严格保留基于目录的权限继承机制（`skill.inheritPermission && skill.parentId`），与应用资源快照重构相互解耦，不破坏既有目录权限体系。

---

## 12. 资源模型

```ts
type AppResource =
  | { type: 'tool'; id: string; data?: { toolNames?: string[] } }
  | { type: 'model' | 'agent' | 'dataset' | 'skill'; id: string };
```

- `tool`：个人工作流工具、MCP/HTTP 工具集；系统/商业工具不进快照。
- `data.toolNames`：这版图选中的 MCP/HTTP 子工具，缺省表示整包。只用于运行时按快照过滤，**不是**读权限粒度；鉴权只针对父工具集 App。
- `model` 进入标准资源鉴权并与其他资源统一使用 `type + id`；静态模型写入快照，动态模型输入不写入静态快照并在运行时按运行人鉴权。
- 提取器只解析、归一化、合并、去重、稳定排序，不访问数据库。
- 动态资源 ID 保存阶段不确定则不虚构记录。

---

## 13. 表单应用（Agent & AgentV2）发布校验与提示对齐

### 13.1 现状与问题
在表单式应用（Agent 与 AgentV2）中，若引用的工具、技能、知识库等资源被卸载、删除或操作者无权限，点击发布时出现提示 UI 不一致：
- **Agent**：前端 `Header.tsx` 捕获到工作流图中的工具异常，但直接写死弹窗 `app.error.publish_unExist_app`（“发布失败，请检查工具配置是否正确”）；
- **AgentV2**：工作流未将工具展开为独立节点，且通用校验器 `check/check.ts` 未对未开放的 Agent 节点进行工具校验，导致请求直接穿透到后端 `/api/core/app/version/publish` 接口，后端 ACL 鉴权失败返回 `unAuthApp`，前端弹窗 `code_error.app_error.un_auth_app`（“无权操作该应用”）。

### 13.2 对齐方案与设计决策
1. **统一前端拦截**：在 `Header.tsx` 的 `checkData` 发布前阶段，统一调用表单资源检查函数 `checkAppFormResourceIssues`，对 `appForm.selectedTools`、`appForm.selectedAgentSkills`、`appForm.dataset.datasets` 进行有效性与权限扫描，若存在异常立即在前端阻断发布。
2. **优先显示具体原因**：
   - 提取具体错误原因（无权限优先提示 `core.workflow.check.resource_no_permission` 或 `tool_no_permission`，已下线提示 `tool_offline`，已删除提示 `tool_missing` / `resource_missing`）；
   - 在后续 `checkWorkflowBeforeRunOrPublish` 检查中，若发现其他错误（如模型未配置、模型不可用），优先取 `firstIssue.message`，兜底才使用通用文案。
3. **工作流校验器边界保护**：保持 `check/check.ts` 不变，不提前引入对未开放的 Agent 节点的工作流校验，改动完全收敛在表单层 `FormComponent` 中。

---

## 14. 资源可用性状态模型统一重构（收敛为统一的 `error`）

### 14.1 动机与设计原则
在应用工作流与表单视图中，引用的外部资源（Tool、Skill、Dataset）在编辑态存在多种可用性异常（无权限、已删除、加载失败、已下线）。
历史代码中分别采用了多套互不连贯的字段：
- **Tool**：使用 `pluginData.error: string`，并叠加了本次新增的 `permissionDenied: boolean`；
- **Skill**：使用 `isDeleted: boolean`，并叠加了 `permissionDenied: boolean`；
- **Dataset**：使用 `isDeleted: boolean`，并叠加了 `permissionDenied: boolean`。

这导致了：
1. **字段多义性与互斥 Bug**：同一个对象同时存在多个独立的布尔与错误码字段，在 UI 渲染层容易漏掉互斥判断，导致同一个卡片同时渲染多个互相挤压的错误 Tag；
2. **逻辑冗余分裂**：前端组件与校验器必须不断编写 `isDeleted || permissionDenied || error` 的多分支判断。

由于知识库与技能在持久化（保存至 MongoDB）时仅保留 `{ datasetId }` 和 `{ skillId }`，`isDeleted` 与 `permissionDenied` **纯属服务端读取详情（`rewriteAppWorkflowToDetail`）时附加的只读视图状态（View State）**，因此不需要数据库迁移与字段兼容包袱，直接进行彻底的干净重构。

### 14.2 统一状态模型
全面废除 `isDeleted` 与 `permissionDenied` 字段，统一收敛为单一事实来源：`error?: string`。

统一的错误码规范（与 `workflowCheck` 统一）：
- `resource_no_permission`：资源存在，但不在当前快照且当前查看者无权限（展示文案：“无权限访问该资源，请检查权限”）；
- `resource_missing`：引用的资源已删除或不存在（展示文案：“引用的知识库或技能已删除或不可用，请删除”）；
- `tool_offline`：引用工具已下线（展示文案：“引用工具已下线，请删除”）；
- `tool_load_failed`：工具加载或解析失败（展示文案：“工具加载失败，请稍后重试”）；
- `undefined`：资源正常可用。

### 14.3 涉及范围
1. **类型定义（Global Types）**：
   - `SelectedDatasetSchema`：移除 `isDeleted`、`permissionDenied`，增加 `error: z.string().optional()`；
   - `SelectedAgentSkillItemTypeSchema`：移除 `isDeleted`、`permissionDenied`，增加 `error: z.string().optional()`；
   - `SelectedToolItemType` / `FlowNodeItemType`：`pluginData` 中移除 `permissionDenied`，统一使用标准错误码；
   - `FlowNodeInputItemType`：移除 `permissionDenied`。
2. **服务端数据装配（Service Core）**：
   - `packages/service/core/app/utils.ts`：
     - `loadToolNode`：快照外无权限时直接返回 `{ success: false, error: 'resource_no_permission' }`，移除 `permissionDenied`；
     - `loadAgentSkill`：快照外无权限返回 `error: 'resource_no_permission'`，已删除/不存在返回 `error: 'resource_missing'`，移除 `isDeleted` 和 `permissionDenied`；
     - `formatSelectedDatasetValue`：快照外无权限返回 `error: 'resource_no_permission'`，已删除/不存在返回 `error: 'resource_missing'`，移除 `isDeleted` 和 `permissionDenied`。
3. **前端 UI 组件（Web Components）**：
   - `DatasetCard.tsx`：仅依赖 `dataset.error` 判断 `isUnavailable` 与错误文案渲染；
   - `ChatAgent/EditForm.tsx` / `NodeAgent/index.tsx`：技能卡片仅依赖 `skill.error` 渲染单个错误 Tag；
   - `ToolSelect.tsx`：工具卡片仅依赖 `tool.pluginData?.error`（或下线状态）渲染单个错误 Tag，不再存在双标签 Bug；
   - `DatasetSelectModal.tsx` / `SkillSelectModal.tsx`：通过 `!item.error` 过滤有效项。
4. **校验层（Workflow & Form Check）**：
   - `check/check.ts`：统一通过 `item.error === 'resource_no_permission'` 和 `item.error === 'resource_missing'` 报告 issue；
   - `checkAppForm.ts`：统一通过 `tool.pluginData?.error`、`skill.error`、`dataset.error` 进行表单级发布前阻断与文案提取。
5. **单元测试回归（Tests）**：
   - 更新 `rewriteAppWorkflowToDetail.test.ts`、`checkAppForm.test.ts`、`workflow/utils.test.ts`、`controller.test.ts` 等单测断言。

---

## 15. 软删除资源鉴权修正与工具快照名称对齐

### 15.1 已删除资源误判为“无权限”问题根因与修复
1. **核心鉴权增加 `deleteTime: null`**：
   - 知识库与应用在软删除时标记 `deleteTime: new Date()` 并清理对应的 ACL 权限记录。
   - `authAppByTmbId`（`packages/service/support/permission/app/auth.ts`）、`authDatasetByTmbId`（`packages/service/support/permission/dataset/auth.ts`）以及 `getClientToolPreviewNode`（`packages/service/core/app/tool/utils/client.ts`）此前在底层 `findOne` 时未携带 `deleteTime: null` 过滤条件，导致软删除记录被查出并在随后的 ACL 检查中因无权限记录而误抛 `AppErrEnum.unAuthApp` / `DatasetErrEnum.unAuthDataset`。
   - 统一在底层查询中加入 `{ deleteTime: null }`，软删除资源立即拒绝并抛出 `unExist`，确保底层鉴权不将“已删除”误判为“无权限”。
2. **快照工具鉴权错误细分**：
   - `packages/service/core/app/utils.ts` 中的 `authSnapshotExternalTool` 改为返回 `'resource_no_permission' | 'tool_missing' | undefined`；
   - 精确捕获 `AppErrEnum.unExist` 与 `PluginErrEnum.unExist` 并返回 `'tool_missing'`，其他鉴权异常返回 `'resource_no_permission'`；
   - 错误提示统一使用 `common:core.workflow.check.tool_missing`（“该工具不存在或已被删除”）。

### 15.2 Agent 与 AgentV2 无权限工具名称展示对齐（纯快照机制）
1. **Schema 扩展**：
   - `packages/global/core/app/tool/type.ts` 的 `AgentToolBaseSchema` 与 `CanonicalAvailableAgentToolSchema`（`packages/global/core/workflow/migration/schema.ts`）补充可选字段 `name?: string` 与 `avatar?: string`，保证快照元数据在 Zod 校验和规范化迁移时不被剥离。
2. **AgentV2 序列化保存快照**：
   - `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/utils.ts` 的 `agentForm2AppWorkflow` 将 `tool.name` 与 `tool.avatar` 保存到 `inputs[selectedTools]` 中（与技能快照机制对齐）。
3. **详情回填回退快照**：
   - `packages/service/core/app/utils.ts` 的 `rewriteAppWorkflowToDetail` 在外部工具加载失败时，回退使用快照 `tool.name ?? 'Invalid'` 与 `tool.avatar ?? ''`，不再硬编码 `Invalid`；
   - `projects/app/src/pageComponents/app/detail/Edit/SimpleApp/utils.ts` 的 `appWorkflow2Form` 优先使用最新名称（`node.pluginData?.name ?? node.name`），无权限或加载失败时回退至节点快照。

### 15.3 工具错误解析统一收敛（废弃并移除 `formatToolError`）
1. **完全废弃并移除 `formatToolError`**：
   - 经审查确认，`pro` 仓库与主仓库中 `formatToolError` 无外部依赖，且与 `workflowCheck` 的错误码解析逻辑高度重复、文案定义割裂；
   - 彻底从 `@fastgpt/global/core/app/utils.ts` 中删除 `formatToolError` 及无用 imports；
2. **统一由 `getToolErrorMessage` 负责**：
   - 统一由 `@/web/core/workflow/check/message` 的 `getToolErrorMessage({ status, error, t })` 负责工具下线状态（`status === PluginStatusEnum.Offline`）、已知错误码（`resource_no_permission`、`tool_missing`）以及具体未知报错的格式化；
   - 工具不存在/已删除/已下线文案全面统一收敛为：“该工具不存在或已被删除”（`common:core.workflow.check.tool_missing`）；
   - `ToolSelect.tsx`、`NodeCard.tsx` 以及 `checkAppForm.ts` 全面切换至 `getToolErrorMessage`。
3. **表单发布校验收敛**：
   - `checkAppForm.ts` 直接使用 `getToolErrorMessage` 解析工具问题，彻底消除冗余常量与条件分支；
   - 统一遍历 `dataset.datasets` 与 `selectedAgentSkills`，收敛为单一资源数组处理 `{ error?: 'resource_no_permission' | 'resource_missing' }`。

### 15.4 Agent 技能快照保存与资源机制对齐（纯快照机制）
1. **统一纯快照机制**：
   - Skill 与 Tool 机制完全对齐，统一依赖节点快照，不单独为 Skill 开辟数据库回查旁路；
   - 修复此前 `StoredSelectedAgentSkillItemTypeSchema` 仅 pick `skillId` 导致保存时剥离快照的问题，调整为保留可选的 `name`、`avatar`、`description` 字段；
   - 应用保存时，快照元数据持久化到工作流节点；加载详情时，未授权或已删除的 Skill 直接使用节点快照中的 `name` 与 `avatar`。

### 15.5 外部引用资源统一解析驱动与知识库快照对齐
1. **统一通用资源解析驱动（`resolveSnapshotResource`）**：
   - 在 `packages/service/core/app/utils.ts` 中抽象通用驱动器 `resolveSnapshotResource`，统一负责外部引用资源（Skill、Dataset）的四步标准流程：
     1. 快照基线检查（`hasSnapshotResource`，已发布 Version 快照内无需重鉴权）；
     2. 动态鉴权/DB 查最新（统一携带 `deleteTime: null` 过滤软删除）；
     3. 异常归一化（无权限映射为 `resource_no_permission`，软删除/未找到映射为 `resource_missing`）；
     4. 现场组装（成功返回 live 详细信息，失败统一通过 `formatFallback` 回退快照元数据）。
2. **知识库存储快照与展示名称对齐**：
   - 在 `packages/global/core/workflow/type/io.ts` 导出 `StoredSelectedDatasetSchema`，保存时保留展示快照（`datasetId`、`name?`、`avatar?`、`vectorModel?`），仅剥离编辑态临时状态；
   - 修复 `packages/service/core/app/controller.ts` 的 `formatDatasetSelectValue`，不再将知识库过度压缩为纯 `datasetId`；
   - 统一缺失/未保存快照时的回退名称为 `Invalid`，与 Skill（`skill.name ?? 'Invalid'`）和 Tool（`tool.name ?? 'Invalid'`）保持完全一致；
   - 调整 `projects/app/src/components/core/app/DatasetCard.tsx`，与 `SkillCard.tsx` 和 `ToolSelect.tsx` 全面收敛：外层包裹 `<MyTooltip label={tooltipLabel} showOnlyWhenOverflow={!hasError}>`（异常时悬浮显示错误提示，正常时溢出显示名称），内部直接渲染 `{dataset.name || 'Invalid'}`，状态统一由右侧红色 Tag 独立呈现。

---

## 16. 模型选择器组件与应用资源基线适配

### 16.1 现状与问题定义
在应用资源权限重构中，`model` 已作为资源快照（`{ type: 'model', id }`）纳入应用基线体系。应用内已保存的模型属于当前应用已授权资产，无论是调试运行还是版本保存，均以基线资源为准，不要求协作者个人拥有该模型的调用权限。

然而，模型选择器收起态使用的展示接口 `/api/core/ai/model/summary` 原先仅校验当前操作人的个人模型权限，导致：
- **已授权模型收起态误报“无权限”**：应用中原作者已配置好的模型（如 `qwen3.5-flash`），协作者打开应用后调试运行完全正常，但界面选择器卡片上却错误显示红字 `No permission to use {{model}}`，造成体验与权限认知割裂。

### 16.2 方案定位：“只读保活，选配受控”（Graceful Read & Restricted Selection）
针对上述问题，确立了以最小改动面为核心的收敛原则：**对应用已有合法资产保证展示与运行正常（只读保活），但对协作者无权访问的模型不赋予主动挑选能力（选配受控）**。

具体落地拆解如下：

#### 1. 后端轻量基线感知（仅改动 summary 接口）
- **接口扩展**：在 `/api/core/ai/model/summary` 中增加可选参数 `appId`；
- **基线校验**：若传入 `appId`，接口校验当前用户对该应用的只读权限（`authApp`），并提取该应用的草稿资源基线。只要待查询模型属于当前应用基线，即视作在当前应用范围内已获授权，状态返回为 `active`；
- **个人目录完全不侵入**：`/api/core/ai/model/catalog` 保持不变，严格反映用户自身的模型权限。

#### 2. 底层基础设施零侵入
- 全局单例 `useUserModelStore`、`modelData.ts`、`useModelQuery`、`useModelList` 等核心底层完全不改动、不传递 `appId`，彻底杜绝全局 Store 切片与并发时序竞争；
- `modelSummaryLoader` 与 `useModelSummary` 的缓存 Key 追加 `appId` 维度进行应用间展示缓存隔离。

#### 3. 前端模型选择器（AIModelSelector）极简适配
- **收起态只读保活**：`AIModelSelector` 从上下文（`AppContext`）或属性获取 `appId` 并透传至 `useModelSummary`，根据接口返回的 `active` 正常渲染模型名称与图标，彻底消除红字报错；
- **展开态选配受控**：下拉候选列表 100% 沿用当前用户的个人模型目录（`modelList`），不进行任何人工基线补齐。协作者无权限的模型不会出现在候选菜单中，无法主动选配；
- **零额外状态维护**：组件不维护任何额外的基线模型引用或下拉选项合成逻辑，代码纯粹无副作用。

#### 4. 详情刷新平滑过渡（Stale-While-Revalidate）
- **根因消除**：在 `useModelSummary` 中通过 `targetKey` 对齐当前模型身份与应用维度；
- **平滑过渡**：当打开下拉菜单或触发后台状态校验时，若在途请求正在重新验证相同模型，界面继续展示上一帧已有的有效详情，直到新响应返回后再平滑更新，彻底杜绝下拉展开或二次校验时瞬间闪烁 `Requesting models`（模型请求中）的问题。

---

## 17. 工作流静态资源 JIT 纯实时按需鉴权与加载架构（JIT Resource Loading）

### 17.1 架构动因与演进
在原实现中，静态资源快照（`resources`）在工作流运行开局时（第 0 毫秒）强行全量调用 `loadWorkflowResourceContext`，并发查询所有可能用到的 `MongoApp`、`MongoDataset`、`MongoAgentSkills` 以及 `MongoAppVersion`，并将实体对象存入内存 Map（`appMap`、`workflowMap`、`datasetMap`、`skillMap`）。

这带来了明显的缺陷：
1. **首字延迟（TTFT）劣化**：无论本次对话走向哪个分支，入口必须强制等待一批评定可能用不上的数据库查询；
2. **分支污染与误报**：条件分支（如 If-Else）中未走到的分支若存在已被删除或失效的资源，开局预热也会强行查库或在未命中时崩溃；
3. **内存臃肿与重复存储**：Context 既保存了数组 `resources`，又保存了 `resourceMap`，还持有着庞大的实体对象字典。

为此，重构为**纯 JIT 实时按需加载与鉴权架构**：开局不查库、不存实体缓存、节点执行时现场核对白名单并单点查库。

### 17.2 极简无状态快照上下文（Stateless Resource Context）
彻底移除所有实体 Map 和冗余数组，`WorkflowResourceContext` 仅保留 3 个字段：

```ts
export type WorkflowResourceContext = {
  teamId?: string;
  /** root Test/Debug 请求允许子工作流沿用跨团队资源权限。 */
  isRoot: boolean;
  /** 唯一的内存白名单字典，专职提供微秒级的 O(1) 比对 */
  resourceMap: Map<string, AppResource>;
};
```

入口初始化函数 `createWorkflowResourceContext`（原 `loadWorkflowResourceContext`，已改为同步） 退化为纯内存转换操作（耗时 ~0ms，零 DB 批量查询）：
```ts
export const createWorkflowResourceContext = ({
  resources,
  teamId,
  isRoot = false
}: {
  resources: AppResourcesType;
  teamId?: string;
  isRoot?: boolean;
}): WorkflowResourceContext => {
  const normalizedResources = mergeAppResources(resources);
  const resourceMap = new Map(
    normalizedResources.map((resource) => [getAppResourceKey(resource), resource])
  );
  return { teamId, isRoot, resourceMap };
};
```

### 17.3 流程对比

```mermaid
flowchart TD
    subgraph 原有架构 (Eager 预热 + 内存大字典)
        A1[API 入口] --> B1["loadWorkflowResourceContext (全量查库: MongoApp, MongoDataset, MongoAppVersion)"]
        B1 --> C1["预热填满 appMap, datasetMap, workflowMap (持有大量实体状态)"]
        C1 --> D1[启动工作流引擎 dispatchWorkFlow]
        D1 --> E1{未命中分支资源失效?}
        E1 -- 是 --> F1[开局直接报错崩溃 ❌]
        E1 -- 否 --> G1[从内存 Map 读取实体]
    end

    subgraph 纯粹 JIT 架构 (只留 resourceMap, 节点内按需核对与回退)
        A2[API 入口] --> B2["createWorkflowResourceContext (纯内存构造 resourceMap, 0ms, 零 DB 查询)"]
        B2 --> C2[启动工作流引擎 dispatchWorkFlow]
        D2[流转到具体节点]
        C2 --> D2
        D2 --> E2{"节点内使用资源? (model / dataset / skill / tool / agent)"}
        E2 -- 未走该分支 --> F2[零 DB 查询, 完全无损跳过 ✅]
        E2 -- 走该分支 --> G2{"hasWorkflowResource (命中 resourceMap 快照?)"}
        G2 -- 未命中快照 --> H2["回退按运行人 (tmbId) 权限鉴权与加载"]
        G2 -- 命中快照 --> I2["免运行人鉴权, 实时查库/读取目录 (~1ms)"]
        I2 -- 实体已被删/查不到 --> J2[抛出不可用领域异常 ❌]
        I2 -- 查得实体 --> K2[直接执行节点业务逻辑]
    end
```

### 17.4 节点内按需鉴权与加载收敛规则

1. **模型（`loadWorkflowModelResource`）**：
   - 在具体使用模型的节点内调用，先通过 `ModelHandle` 解析模型定义（可选槽位支持 `fallbackToDefault: true`）；
   - `modelId` 或 legacy `model` 解析出的实际模型 ID 命中 `hasWorkflowResource({ type: 'model' })` 时直接放行；未命中时回退 `assertAuthModels(use)` 按运行人鉴权。
2. **子应用与工具集（`loadWorkflowAppResource` / `loadChildWorkflowWithResource`）**：
   - 命中 `hasWorkflowResource` 时直接现场执行 `MongoApp.findOne`；未找到或格式非法统一抛出 `WorkflowResourceError`；
   - 未命中快照时回退按当前运行人读权限查询（`authAppByTmbId`）；
   - 子应用工作流节点按需通过 `loadChildWorkflowWithResource` 实时获取对应版本及独立资源上下文。
3. **知识库检索（`loadWorkflowDatasetResource` / `loadAgentDatasetContext`）**：
   - 命中 `hasWorkflowResource({ type: 'dataset' })` 时现场执行 `MongoDataset.findOne` / `MongoDataset.find`；查不到统一抛出 `DatasetErrEnum.unExist`；
   - 未命中快照的知识库回退按当前运行人读权限鉴权（`authDatasetByTmbId` / `filterDatasetsByTmbId`）。
4. **沙箱技能（`loadWorkflowSkillResources` → `injectAgentSkillFilesToSandbox`）**：
   - 工作流 prepare 先加载技能：命中快照的直接按团队约束查询实体，缺失抛出 `SkillErrEnum.unExist`；未命中的按运行人读权限校验，无权限或不存在时跳过；
   - 沙箱注入只接收已授权实体，负责读取技能版本并部署文件，不读取工作流上下文、不执行成员鉴权。
5. **统一复用与错误隔离**：
   - 所有派发分支统一收敛至 `packages/service/core/workflow/resource/service.ts`，运行态不再维护任何 `dynamic*` 布尔标记；
   - 不引入任何中间层查询缓存，每次执行现场查库，确保多节点或协作修改的数据实时一致性。

## 18. 资源模块职责重构

资源身份和授权语义保持不变；旧 `model` 只解析系统模型并跳过鉴权。

- `global/core/workflow/model` 保存槽位与校验契约，`global/common/workflow` 保存共享纯引用处理；不依赖 web 组件。
- `service/core/app/resource/utils.ts` 负责资源提取、合并、差量与查询条件，不查库、不记录日志。
- `service/core/app/resource/service.ts` 负责草稿基线、保存/发布增量权限和调试资源准备；版本读取不再执行业务回调。
- `service/core/workflow/resource/context.ts` 负责快照上下文与选择，`service.ts` 负责执行点授权和加载；不进入草稿/发布编排。
- 沙箱注入函数只接收已授权 Skill，工作流 prepare 在调用前加载授权资源。
- 前端校验分别接收引用状态与默认模型 ID；应用摘要只补引用状态，不伪造 `isSystem`。`web/core/workflow/service.ts` 编排数据读取与结构转换，`check/check.ts` 只执行校验。
- 资源数据库读取只转换已知 ID 类型错误，连接/存储故障正常传播。

重构验收：

- [x] 旧路径、转导层与反向依赖已清除，直接调用新的定义模块。
- [x] 草稿缺失/非法快照、root、系统工具、成员回退与旧模型约定保持一致。
- [x] 共享槽位选择有统一实现，前端引用与默认值契约分离。
- [x] 沙箱部署不读取 Workflow 上下文或成员权限。
- [x] 相关局部测试、类型检查、lint、依赖检查通过。


### 18.1 工作流校验与共享工具归属

- 删除旧前端 `workflowCheck.ts` 与 `global/core/workflow/utils.ts`，调用方直接导入实际定义模块，不保留 barrel 或旧路径转导。
- 前端 `check/check.ts` 组织扫描，`graph.ts` 建立一次图索引，`node.ts` 与 `model.ts` 返回问题代码和展示参数，`message.ts` 在输出边界补全翻译和节点信息。工具错误来源归一化放在 `error.ts`，不依赖展示模块。
- 节点模型与聊天配置模型复用同一引用匹配；非空稳定 ID 不按旧名称兜底，只有旧 WorkflowTool 自定义选择器保留既有名称默认值兼容。
- `global/common/workflow` 承担连线标识、输入投影和条件分支规则；`global/common/app` 承担 App 聊天配置、沙箱能力查询和 App/工具到节点 IO 的适配。
- 变量图标格式化归 Web 展示层，工具运行消息构造归唯一使用方 PluginRunBox；删除始终返回空对象的 `getModuleInputUiField`。
- App `legacy/utils.ts` 集中处理旧欢迎语、文本变量类型及 enums，并在适配前补齐旧工具集 ID。兼容转换不修改原记录。`welcomeText` 仍是会话保存和当前表单使用的字段，继续与 welcomeConfig 保持同步。
- 保留错误代码、画布节点顺序、单节点检查的全图上下文以及旧模型免 ACL 语义；相关校验和共享函数测试迁移到新模块对应位置。

- 小文件按语义聚合：连线 handle 编码归入共享 reference；条件标签与分支 ID 初始化合并到 condition；App 沙箱能力查询归入 App workflow。资源上下文与变量选择器类型分别并入已有 runtime/type 与 type/io；Web 变量图标格式化并入工作流展示工具，规则输出类型并入前端 workflow/type。
- 保留异步准备入口、聊天配置模块和工具错误归一化模块的独立边界，避免为了减少文件数量引入展示层与规则层的反向依赖。
