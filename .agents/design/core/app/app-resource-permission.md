# 应用工作流与资源快照

目标：Version 成为工作流图和资源授权的唯一事实；App 只保留资源和元数据。不再用 `apps.modules` 当草稿/运行配置。`resources` 只写在 Version 上：缺字段时现场走与迁移相同的提取，`[]` 就是空快照。

相较上一版设计的关键变化：

- 资源快照只落 `app_versions.resources`，App 主表不存这份缓存；
- 取消「正式 Version 缺 `resources` 抛 `App resources are not migrated`」；
- 工作流图迁到 Version，App 只用 `publishedVersionId` 指向正式版；
- 保存/发布鉴权改为相对最新 Version 的增量校验（第 7 节）。

资源模型（`AppResource`、工具归一化、`toolNames`、模型只统计不鉴权）与上一版相同，见文末附录。

---

## 1. 数据落在哪

### 1.1 `app_versions`（唯一事实）

每条 Version 一次写入：`nodes / edges / chatConfig / resources`。

正式 Version 的 `resources` 必须和该条 nodes 同源。草稿（自动保存/普通保存）允许节点里出现尚未写入快照的新增引用，见第 7 节。

### 1.2 `apps`（资源行 + 指针，不再存图）

留下：`name / avatar / intro / type / parentId / teamId / tmbId / permission 相关 / deleteTime / pluginData / scheduledTrigger*` 等。

增加（或复用现有指针）：

- `publishedVersionId`：当前最新正式 Version。反查、正式 Chat 选版都用它，避免扫全部历史正式版。
- 编辑器工作副本不保存 App 指针，每次按该 App 的 `time` 最新 Version 读取（含 `isAutoSave`）。

去掉：

- `modules / edges / chatConfig`（迁移并改读路径后 `$unset`）
- `resourceRefs`（本次重构前已存在，4163 `$unset`）

文件夹没有工作流，不写 Version，也没有这些图字段。

`pluginData.nodeVersion` 与 `publishedVersionId` 的职责不得混用：正式运行只看 `publishedVersionId`（或等价的最新正式 Version 查询），不看 `nodeVersion`。

---

## 2. 读路径

| 场景 | 读谁 |
| --- | --- |
| 正式 Chat / OutLink / MCP 调 App / 定时任务 | `publishedVersionId` 对应 Version；没有指针则 `isPublish: true` + `time: -1` |
| 子 App / 工具钉死 `versionId` | `getAppVersionById`，只读那一条 |
| 打开编辑器、复制工作流 | 该 App `time` 最新 Version（含 autoSave） |
| Skill/资源反查（哪些 App 在用） | 查 **当前正式 Version**：`_id ∈ publishedVersionId` 且 `resources.$elemMatch`。禁止对所有 `isPublish: true` 做 elemMatch，否则旧正式版会把已删引用算进去 |

Test/Debug：仍用请求体 nodes，服务端 `extract` + 按当前操作人鉴权，不读已发布快照，不接受客户端传 `resources`。

不要用 `apps.modules` 补运行快照。不要用最新正式 Version 的 `resources` 去跑另一条 Version 的 nodes。

编辑器详情 `GET /core/app/detail`、创建 `POST /core/app/create`、画布和工具编辑都直接用 `nodes`，与 Version 同名。不要再把 Version.nodes 映射成 App.modules。`apps.modules` 只作为 4163 `$unset` 的历史字段。

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

保存/发布：`extractAppResources` → 相对上一版增量鉴权（第 7 节）→ 与 nodes 同事务写入。`model` 只记录，不鉴权。系统/商业工具不进快照。

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

允许读时懒回写 `$set.resources`，避免每次 extract。4163 仍可批量回填并 `$unset resourceRefs`。

空数组与缺字段必须区分：不引任何资源的应用保存后就是 `[]`。

---

## 5. 运行时授权

- 静态资源：必须命中当前选中 Version 的 `resources`，不按运行人 ACL。
- 动态输入：`nodeHasDynamicInput` 标记后，按运行人 `auth*`。不能用「未命中快照」反推动态。
- 父子不共享快照：父先过 `agent/tool`，子用子 Version 自己的 `resources`。
- 系统 Skill 放行；MCP/HTTP 用父工具集 id + 可选 `toolNames`。
- `authTmbId` 仍是终端用户数据过滤，和发布快照是两层。
- 无 `resourceContext` 仅保留非 App 场景：Skill 调试、商业工具主动清空父快照。App 正式运行（含 Pro 评测 / Home Chat）必须带快照。不能裸 `findById`。
- 入口批量加载实体；root Test/Debug 才允许跨团队，并向下传 `isRoot`。
- 缺失/软删/跨团队**不在入口 fail-fast**：实体不在快照 map 时，只在用到该资源的节点按需抛错（`loadWorkflowDatasetResource` / `loadWorkflowAppResource` / `assertWorkflowResource`），其余节点照常执行。编辑器通过 workflow check 标出失效引用并定位到节点（`resource_missing`）。

---

## 6. 迁移

### 6.1 4163（资源）

- 已有 Version：按该条 nodes 提取并写入 `resources`（逻辑与运行时缺字段相同）。
- 有正式 Version：不要用 App.modules 覆盖该 Version 的 nodes。
- 清 `resourceRefs`。
- 给仍在用的 App 补 `publishedVersionId`（最新 `isPublish: true`）。
- 正式指针回填 OCC：只在 `publishedVersionId` 仍为空或仍是本次扫描结果时写入，避免覆盖并发发布。

### 6.2 补 Version（仅零条记录）

- `app_versions` 里该 `appId` **一条都没有**：才用 App 的 `modules/edges/chatConfig` 建一条 `isPublish: true`，并写出 `resources`、`publishedVersionId`。
- **只要有任意 Version（含 MCP/HTTP 那一条、仅 autoSave）**：不把 App 图拷进 Version。

### 6.3 清 App 图

1. 补 Version + 4163 完成
2. 读路径全部改到 Version
3. 写路径不再写 App 图
4. `$unset modules/edges/chatConfig` 以及 `resourceRefs`

**MCP/HTTP**：已有 Version，不新建、不覆盖；最多校验与旧 `apps.modules` 是否一致。

**类型转换**：清空前必须改为写 Version，否则「有 Version 就不迁 App 图」会丢掉只写在 App 上的转换结果。

---

## 7. 保存增量鉴权

动机：协作编辑时，上一版已经授权的资源不应要求当前保存人再具备读权限；否则改一句提示词也会被已撤权的知识库挡住。

比较基准统一为 **该 App `time` 最新 Version**（含自动保存记录）。缺 `resources` 时按第 4 节 extract 得到 baseline。

```text
extracted = extractAppResources(nodes, chatConfig)
baseline  = 最新 Version 的 resources
added     = extracted 相对 baseline 的新增（type + id，模型另含 modelType）
kept      = extracted 中已在 baseline 出现的部分（不重新鉴权）
```

- 已在 baseline 中的资源：直接进入本版 `resources`。节点里删掉的引用不再保留。
- 新增资源：按当前操作人做读权限校验。
- `model` 不鉴权。系统/商业工具不进快照。
- 创建 App（无上一版）视为全部新增，全量校验。
- Test/Debug 仍使用请求体 nodes 生成运行时资源上下文；主应用先按当前操作人校验，工作流资源只校验相对 draft baseline 的新增部分。已在草稿快照中的资源不重复校验当前操作人。

### 7.1 自动保存 / 普通保存：不阻断

节点原样写入。`resources` 只收录：

- `kept`（上一版已有，即使当前用户已无读权限）
- `added` 里当前用户**有**读权限的部分

无权限的新增引用留在 nodes 里，不写入 `resources`，保存成功。草稿允许 `nodes` 比 `resources` 多。

- 指向**已删除/不存在**实体的新增引用与无权限同口径：保存/自动保存不阻断，丢弃出 `resources`、留在 nodes；下次进入编辑器或轮询扫描时 workflow check 标出（`resource_missing`）并定位，直到用户移除节点，或发布时被 §7.2 阻断。
- `kept`（已在 baseline 里的资源）不做存在性检查、不重验权限：引用从节点移除后 extract 自然不再产出，本版 `resources` 自动剔除；被删引用由编辑器轮询 / workflow check 标出并定位，提示用户移除节点。

### 7.2 保存并发布：阻断

相对保存开始时读取到的最新 Version 做增量。`added` 里任一无权限（含已删除/不存在，`unExist`），**整次发布失败**，指出缺权限的资源，不写正式 Version，不改 `publishedVersionId`。

全部新增都有权限时，写入的 `resources = kept + added`，与本次 nodes 同源。正式 Chat 只跑这类 Version。

含义：协作者可以把 owner 已经写进草稿快照的资源发布出去（相对 draft 不算新增）；自己新加、自己没权限的资源过不了发布。

### 7.3 `toolNames` 不是权限层

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
- 历史 `{ teamId, deleteTime, resourceRefs.skillIds }` 声明 `deprecated: true`，由索引管理器清理

---

## 9. 落地顺序

1. **读容错**：`getAppLatestVersion` / `getAppVersionById` 对缺 `resources` 改为 extract，去掉该错误码；`[]` 保持空。
2. **指针**：发布/创建写入 `publishedVersionId`；4163 回填。
3. **反查改查正式 Version**。
4. **零 Version 补建正式 Version**。
5. 编辑器/复制/Chat 回退改读 Version；类型转换/MCP 更新只写 Version。
6. `$unset` App 上的图字段和 `resourceRefs`。

第 1 步可先于清 App 上线，聊天不必等 4163 跑完。4–6 是结构重构，要按序，不能先清空再改读。

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

---

## 11. 已确认决策

1. 读时懒回写 `resources` 本次不做。4163 批量回填即可；运行时缺字段每次 extract。
2. `pluginData.nodeVersion` 继续写，仅给工具/子 App 钉版本用。正式运行只看 `publishedVersionId`。

---

## 12. 实施 TODO

- [x] `getAppLatestVersion` / `getAppVersionById` 缺字段 extract，删除 `App resources are not migrated`。
- [x] App 增加并维护 `publishedVersionId`（创建/发布/4163）。
- [x] 反查改为正式 Version `$elemMatch`。
- [x] 保存增量鉴权（相对 baseline，旧资源不重验）。
- [x] 无 `resourceContext` 时 dataset/toolset 走运行人鉴权，禁止裸 `findById`。
- [x] 零 Version 补建正式 Version；有 Version 不覆盖。
- [x] 类型转换/MCP 更新只写 Version。
- [x] 编辑器与复制改读 draft/最新 Version。
- [x] `$unset` App 图字段和 `resourceRefs`；废弃 `resourceRefs.skillIds` 索引已登记。
- [x] 测试：缺字段 extract vs `[]`；反查只计当前正式版。其余：发布后撤权仍能跑正式版；协作者保存不丢旧资源；新增无权限按确认口径；嵌套钉版本只读那一条。

---

## 附录：资源模型（沿用）

```ts
type AppResource =
  | { type: 'tool'; id: string; data?: { toolNames?: string[] } }
  | { type: 'model'; id: string; data: { modelType: 'llm' | 'rerank' | 'tts' } }
  | { type: 'agent' | 'dataset' | 'skill'; id: string };
```

- `tool`：个人工作流工具、MCP/HTTP 工具集；系统/商业工具不进快照。
- `data.toolNames`：这版图选中的 MCP/HTTP 子工具，缺省表示整包。只用于运行时按快照过滤，**不是**读权限粒度；鉴权只针对父工具集 App。
- `model` 只统计，不鉴权；动态模型输入不写入静态快照。
- 提取器只解析、归一化、合并、去重、稳定排序，不访问数据库。
- 动态资源 ID 保存阶段不确定则不虚构记录。
