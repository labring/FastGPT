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

- 静态资源：必须命中当前选中 Version 的 `resources`，不按运行人 ACL。
- 动态输入：`nodeHasDynamicInput` 标记后，按运行人 `auth*`。不能用「未命中快照」反推动态。
- 静态模型：`modelId` 必须命中当前 Version 的 `{ type: 'model', id: modelId }` 资源；命中即代表该 App 已在发布时获得使用权，不再读取运行人、App owner 或发布人的模型 ACL。
- 动态模型：保存阶段无法确定 `modelId`，运行时按当前运行人模型权限校验；不能借用 App 的静态快照放行动态值。
- 模型快照只替代“人的模型权限”判断，不替代模型有效性判断。模型被删除、停用或类型不匹配时，仍在实际使用节点抛出模型不可用错误。
- 父子不共享快照：父先过 `agent/tool`，子用子 Version 自己的 `resources`。
- 系统 Skill 放行；MCP/HTTP 用父工具集 id + 可选 `toolNames`。
- `authTmbId` 仍是终端用户数据过滤，和发布快照是两层。
- 无 `resourceContext` 仅保留非 App 场景：Skill 调试、商业工具主动清空父快照。App 正式运行（含 Pro 评测 / Home Chat）必须带快照。不能裸 `findById`。
- 入口批量加载实体；root Test/Debug 才允许跨团队，并向下传 `isRoot`。
- 缺失/软删/跨团队**不在入口 fail-fast**：实体不在快照 map 时，只在用到该资源的节点按需抛错（`loadWorkflowDatasetResource` / `loadWorkflowAppResource` / `assertWorkflowResource`），其余节点照常执行。任何资源加载器都不得把“已声明但实体缺失”降级为静默跳过。编辑器通过 workflow check 标出失效引用并定位到节点（`resource_missing`）。

---

## 6. 迁移

本节只约束本设计中的 App 资源迁移，不改变注册表中其他已发布系统迁移的既有语义。该迁移以 `20260909_backfill_app_resource_snapshots` 作为永久任务 ID、首次发布版本为 4.17.0，并作为新的只回填任务追加到注册表末尾，不能修改已经发布任务。

### 6.1 4163（资源）

- 已有 Version：按该条 nodes 提取并写入 `resources`（逻辑与运行时缺字段相同）。
- 有正式 Version：不要用 App.modules 覆盖该 Version 的 nodes。
- 给仍在用的 App 补 `publishedVersionId`（最新 `isPublish: true`）。
- 正式指针回填使用 compare-and-set：只在扫描时读取的 `publishedVersionId` 未变化时写入，避免覆盖并发发布。
- 保留 App / Version 上已有的 `resourceRefs`、`modules`、`edges`、`chatConfig`，迁移不执行任何 `$unset` 或旧记录删除。
- 已有合法 `resources` 直接跳过；迁移只回填缺失或结构非法的快照，重复执行不会改变已迁 Version 和旧字段。
- 历史 Version 中已经存在的静态资源（包括模型）直接回填为该 Version 的授权快照，不追溯校验历史发布人或当前 App owner 的个人权限，避免升级破坏既有正式应用。迁移只验证资源结构；实体缺失或停用仍由编辑器提示和运行时按需报错。

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

比较基准统一为 **该 App `time` 最新 Version**（含自动保存记录）。缺 `resources` 时按第 4 节 extract 得到 baseline。

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
- 编辑器对快照外新增引用的无权限资源标记 `permissionDenied`，在 workflow check 中通过 `resource_no_permission` 标出并定位到错误节点；已删除/不可用资源通过 `resource_missing` 定位。进入工作流编辑器时延迟执行 `scheduleEntryCheck`，若存在错误节点自动 `fitView` 定位并高亮该节点。
- `kept`（已在 baseline 里的资源）不做存在性检查、不重验权限：引用从节点移除后 extract 自然不再产出，本版 `resources` 自动剔除；被删引用由编辑器轮询 / workflow check 标出并定位，提示用户移除节点。

### 7.2 保存并发布：阻断

相对保存开始时读取到的最新 Version 做增量。`added` 里任一无权限（含已删除/不存在，`unExist`），**整次发布失败**，指出缺权限的资源，不写正式 Version，不改 `publishedVersionId`。

全部新增都有权限时，写入的 `resources = kept + added`，与本次 nodes 同源。正式 Chat 只跑这类 Version。

含义：协作者可以把 owner 已经写进草稿快照的资源发布出去（相对 draft 不算新增）；自己新加、自己没权限的资源过不了发布。

模型同样遵循该规则：协作者失去某模型的个人权限后，仍可保存和发布已经存在于 baseline 的模型；新加入的模型必须由当前操作人拥有权限。

### 7.3 模型校验边界

- `formatModels` 只负责 canonical `modelId`、模型存在性、启用状态和类型校验。发布时应传入 `global.systemActiveModelList`，不能先按当前成员权限过滤，否则 baseline 中已有模型会被错误阻断。
- `resolveAppResourcesByPermission` 把 `model` 纳入 `added / kept`，新增模型通过现有 `PerResourceTypeEnum.model` 权限数据和 `getMemberModelIds` 校验。
- `modelId` 已唯一标识 `ai_models` 实体，资源快照统一存 `{ type: 'model', id: modelId }`，不再保存 `modelType`。模型类型仍由提取位置和现有 `getLLMModelData / getRerankModelData / getTTSModelData` 等 typed getter 校验，不进入资源身份。
- 正式运行的静态模型在统一节点调度边界校验当前 Version 快照；动态模型在同一入口按运行人权限校验。各节点不重复接入资源鉴权，也不新增 `loadWorkflowModelResource`。
- Test / Debug 使用请求体生成临时资源上下文：baseline 内模型沿用 App 已有授权，新增模型按当前操作人校验。
- 动态模型或无 App 快照场景使用通用资源权限校验 `{ type: 'model', id: modelId }`，并由 typed getter 校验模型存在、启用和类型；不创建模型专用鉴权分支。
- `createQuestionGuide`、TTS 等独立于 Workflow dispatcher 的 App 辅助入口也必须加载当前正式 Version 的 `resources` 并通过通用 `assertWorkflowResource` 校验 `{ type: 'model', id: modelId }`；不能因它们不在 `runWorkflow` 调用栈内而绕过应用快照。
- App 来源请求携带客户端 `modelId` 时，服务端不得仅信任请求值：静态配置按正式 Version 快照校验；非 App 来源或明确的动态模型按当前运行人权限校验。
- 当前 App 直接提取的模型来源仍是 LLM、rerank、TTS 等已有静态 `modelId` 入口。Embedding 模型属于 Dataset 自身配置，STT 当前没有 App 静态 `modelId`，不在本次提取范围；未来新增直接选择入口时只需让提取器产出同一种 `{ type: 'model', id }` 资源，不扩展资源 Schema。

### 7.4 `toolNames` 不是权限层

本分支之前，MCP/HTTP 只对**父工具集 App** 做读权限，没有按子工具名鉴权。本方案不新增这一层。

增量 `added` 只按 `type + id`。父工具集已在 baseline 时，再勾子工具或改成整包都不触发鉴权。`toolNames` 随本次 extract 写入，只表示这版图选了哪些子工具（运行时按快照过滤），不是独立 ACL。

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
7. 资源无权限与已删除严格区分：编辑器与工作流校验保留 `permissionDenied` 状态并独立报出 `resource_no_permission`，配合工作流加载时的 `scheduleEntryCheck` 自动定位（`fitView`）至错误节点，与已删除实体的 `resource_missing` 区分对待。
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
- **AgentV2**：工作流未将工具展开为独立节点，且通用校验器 `workflowCheck.ts` 未对未开放的 Agent 节点进行工具校验，导致请求直接穿透到后端 `/api/core/app/version/publish` 接口，后端 ACL 鉴权失败返回 `unAuthApp`，前端弹窗 `code_error.app_error.un_auth_app`（“无权操作该应用”）。

### 13.2 对齐方案与设计决策
1. **统一前端拦截**：在 `Header.tsx` 的 `checkData` 发布前阶段，统一调用表单资源检查函数 `checkAppFormResourceIssues`，对 `appForm.selectedTools`、`appForm.selectedAgentSkills`、`appForm.dataset.datasets` 进行有效性与权限扫描，若存在异常立即在前端阻断发布。
2. **优先显示具体原因**：
   - 提取具体错误原因（无权限优先提示 `core.workflow.check.resource_no_permission` 或 `tool_no_permission`，已下线提示 `tool_offline`，已删除提示 `tool_missing` / `resource_missing`）；
   - 在后续 `checkWorkflowBeforeRunOrPublish` 检查中，若发现其他错误（如模型未配置、模型不可用），优先取 `firstIssue.message`，兜底才使用通用文案。
3. **工作流校验器边界保护**：保持 `workflowCheck.ts` 不变，不提前引入对未开放的 Agent 节点的工作流校验，改动完全收敛在表单层 `FormComponent` 中。

---

## 14. 表单应用发布校验 TODO

- [x] 1. 在 `projects/app/src/pageComponents/app/detail/Edit/FormComponent/checkAppForm.ts` 封装 `checkAppFormResourceIssues` 校验函数，覆盖工具、技能、知识库的权限、下线及缺失状态。
- [x] 2. 改造 `projects/app/src/pageComponents/app/detail/Edit/FormComponent/Header.tsx`：在 `checkData` 中接入表单级资源检查，并在 `checkResults.hasError` 时优先展示具体 `issue.message`。
- [x] 3. 编写单测 `projects/app/test/pageComponents/app/detail/Edit/FormComponent/checkAppForm.test.ts`，验证各类异常场景与正常场景。
- [x] 4. 运行单测验证修改结果。
