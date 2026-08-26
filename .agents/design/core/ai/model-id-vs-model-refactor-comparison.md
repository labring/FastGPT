# `modelId` 与 `model-refactor` 模型身份方案对比

## 1. 文档目标

本文对比当前 `modelId` 分支与 `upstream/model-refactor` 在模型稳定身份方案上的差异，判断哪些设计应保留、哪些能力必须补齐，以及哪些模块不能直接混用。

本次分析新增一项硬约束：**最终方案必须管理团队安装模型**。团队安装不是后续扩展，必须进入模型身份、生命周期、权限、缓存、引用和迁移的主流程。

## 2. 对比基线

- FastGPT `modelId`：`817bbbaaa9`，基于 `upstream/main@f7b1a2e0a4`。
- FastGPT `model-refactor`：`1eb5ebec9e`。
- fastgpt-pro `modelId`：`65e22015`，基于 `upstream/main@9be0a567`。
- fastgpt-pro `model-refactor`：`9c76cfdb`。

## 3. 术语与约束

- **稳定模型 ID**：业务引用保存的稳定字符串，不依赖展示名或供应商模型名。
- **系统模型**：平台管理员维护、跨团队可见的模型。
- **团队安装模型**：由某个团队安装、配置或拥有的模型实例；生命周期和可见性受团队边界约束。
- **模板/供应商模型**：插件或系统配置提供的可安装能力描述，不等同于团队安装后的模型实例。
- **旧模型标识**：历史业务数据中的 `model` 字段，通常保存供应商模型名。

硬约束：

1. 新代码统一写入 `modelId: string`。
2. 兼容期可读取旧 `model`，但旧字段不能继续成为新身份来源。
3. 插件模型加载失败时，启动失败；热更新失败时保留原 active 模型集合。
4. 更新已有模型应保留稳定 ID，不能通过删除再插入制造永久 ID 变化。
5. 细粒度协作者权限本期只控制模型获取和前端可选范围；团队安装模型在运行后端必须校验 `teamId` 租户边界，但暂不校验成员/群组/组织权限。
6. 模型变更和权限变更必须正确刷新缓存，不引入 `permissionVersion`。
7. 团队安装模型必须具备明确的安装、更新、卸载、权限、缓存和引用语义。

## 4. 核查大纲

- [x] 4.1 方案边界与领域对象
- [x] 4.2 模型身份字段和 ID 校验
- [x] 4.3 数据结构、唯一约束与团队归属
- [x] 4.4 插件模板加载与模型物化
- [x] 4.5 系统模型和团队安装模型的生命周期
- [x] 4.6 更新语义、失败原子性与 ID 稳定性
- [x] 4.7 业务引用协议与运行时兼容解析
- [x] 4.8 Canonical 写入边界与迁移覆盖
- [x] 4.9 团队权限语义与后端校验边界
- [x] 4.10 缓存刷新与跨成员一致性
- [x] 4.11 模型列表、选择器与团队模型可发现性
- [x] 4.12 Usage、Pro 和 Benchmark 联动
- [x] 4.13 两个方案的可合并边界
- [x] 4.14 推荐方案与必须补齐项

## 5. 逐项核查

### 5.1 方案边界与领域对象

| 维度 | `modelId` | `model-refactor` | 判断 |
| --- | --- | --- | --- |
| 当前范围 | 只重构平台系统模型和业务引用 | 同时重构系统模型、团队模型、Channel、默认模型和监控 | `modelId` 不能直接满足团队安装硬约束 |
| 系统模型 | 插件模型会物化为 `system_models` 文档 | 插件模型只进入模板缓存，系统模型由数据库实例承载 | 两者都有稳定数据库实例 |
| 团队模型 | 没有团队模型文档；权限仅限制系统模型是否出现在成员列表 | 团队作用域文档保存 `teamId/tmbId`，支持创建、编辑、删除和协作者 | `model-refactor` 提供了可复用骨架 |
| 团队安装 | 无安装流程 | UI 称“团队模型”，实现实际是创建者拥有、团队内可分享的私有资源 | 仍需从“个人私有”收敛为“团队安装实例” |

证据：

- `modelId` 的 `SystemModelDocumentBaseSchema` 将 `scope` 固定为 `system`，数据库 Schema 暂不包含 `teamId/tmbId`：`packages/global/core/ai/model.schema.ts`、`packages/service/core/ai/config/schema.ts`。
- `model-refactor` 的创建接口对非 root 写入团队归属字段，同时创建资源 Owner 权限：`projects/app/src/pages/api/core/ai/model/create.ts`。
- `model-refactor` 的模型表和列表 API 已提供系统/团队双 Tab：`projects/app/src/pageComponents/account/model/ModelConfigTable.tsx`、`packages/global/openapi/core/ai/model/api.ts`。

第一性原理上，团队安装模型应拆成三个概念：

1. 插件模板描述“可以安装什么”，不拥有业务引用 ID。
2. 团队安装实例描述“某团队已经安装什么”，拥有稳定 `modelId`。
3. 成员权限描述“团队内谁可以查看或管理该实例”，不决定实例归属。

因此，目标模型不能继续把创建者 `tmbId` 当作安装作用域。`teamId` 应是团队安装实例的所有权和唯一性边界；`createdByTmbId` 只用于审计。

### 5.2 模型身份字段和 ID 校验

两个方案都使用 MongoDB `_id` 作为稳定身份，但外部协议不一致：

- `modelId`：运行时、业务引用和 API DTO 统一使用 `modelId: string`。
- `model-refactor`：模型 DTO 使用 `id: string`，业务对象仍使用 `modelId`，同一领域存在两套字段名。
- 当前 `modelId` 已明确不要求 ObjectId 格式；API、Schema 和选择器接受非空字符串。
- `model-refactor` 的 DTO 多数声明为 `z.string()`，但创建/更新/JSON 导入实现仍调用 `isObjectId` 并构造 `Types.ObjectId`。

结论：保留 `modelId` 的统一命名和 string 合约。MongoDB 当前可继续生成 ObjectId，但业务层不得把 ObjectId 格式当成身份协议。团队安装实例同样返回和保存 `modelId`，不能另建 `id` 字段。

需要注意：如果数据库查询直接使用 string `_id`，Mongoose 当前会做 ObjectId cast；未来若真正生成非 ObjectId 字符串 ID，需要同步把 `_id` Schema 和查询层改成 string。本文的“string 合约”不等于本期必须改变 MongoDB `_id` 的物理类型。

### 5.3 数据结构、唯一约束与团队归属

`modelId` 使用“公共字段 + 按模型类型区分的 `config`”结构；`model-refactor` 将类型专属字段平铺，并依赖 Mongoose `strict:false`。嵌套 `config` 能限制插件返回对象覆盖数据库公共字段，边界更清晰，应继续保留。

当前索引差异：

- `modelId`：系统模型 `{ scope, model }` 唯一，只覆盖 `scope=system`。
- `model-refactor`：系统模型按 `{ model }`、`{ name }` 唯一；非系统模型按 `{ tmbId, model }`、`{ tmbId, name }` 唯一，并额外索引 `teamId/tmbId`。

`model-refactor` 的非系统唯一约束按 `tmbId`，意味着同一团队的不同成员可以重复安装同一个上游模型；模型归属也随创建者个人存在。这与团队安装硬约束不一致。

建议目标字段：

```ts
type ModelScope = 'system' | 'team';

type PersistedModel = {
  modelId: string; // 对外概念，物理上由 _id 提供
  scope: ModelScope;
  teamId?: string; // scope=team 时必填
  createdByTmbId?: string; // 仅审计，不参与所有权
  provider: string;
  model: string;
  name: string;
  isActive: boolean;
  installStatus?: 'installed' | 'uninstalled';
  config: ModelTypeConfig;
};
```

建议索引：

- 系统模型：`{ scope: 1, model: 1 }` 唯一，partial `scope=system`。
- 团队模型：`{ teamId: 1, model: 1 }` 唯一，partial `scope=team`。
- `name` 只是展示名，不作为旧引用兼容键；是否要求团队内唯一属于产品约束，不是 modelId 正确性的必要条件。
- 旧 `{ model: 1 }` 唯一索引继续以 deprecated 定义清理。

本 PR 已采用 `scope` 表达实例作用域；PR3 必须把 `teamId` 设为团队实例的归属字段，不能用 `tmbId` 代替。

### 5.4 插件模板加载与模型物化

`modelId`：

- `pluginClient.listModels()` 失败会让加载失败。
- 启动时先修复存量系统模型，再用 `{ scope:system, model } + $setOnInsert` 物化新增插件模型。
- 成功构建完整临时集合后才替换全局运行时缓存；热更新失败保留旧 active 集合。

`model-refactor`：

- 数据库模型和插件模板并行读取。
- 插件调用失败被 `.catch(() => [])` 吞掉，启动继续。
- 插件模型只进入 `modelTemplateCache`，不自动进入运行时模型集合；团队成员从模板创建非系统模型实例。

团队安装需要采用 `model-refactor` 的“模板与安装实例分离”，否则插件新增一个模板会被错误地视为所有团队已经安装。但失败语义必须保留 `modelId` 当前规则：

1. 启动加载模板失败则启动失败。
2. 热更新模板失败则不发布新的模板缓存和 active 模型缓存。
3. 已安装团队实例来自数据库，插件短暂失败不得删除、停用或重建实例。
4. 插件模板消失时只标记模板不可安装；存量实例如何下线必须由显式策略决定，不能在加载流程中隐式删除。

也就是说，需要选择性移植 `model-refactor` 的模板缓存和模板查询 API，而不是移植其“插件失败视为空列表”的行为。

### 5.5 系统模型和团队安装模型的生命周期

建议将生命周期明确为两条互不混淆的流程：

**系统模型**

1. 插件模板或管理员 JSON 提供配置。
2. 按系统作用域和 `model` 原地 upsert，保留 `_id`。
3. 配置移除时停用，不删除。
4. 只有明确的管理员删除操作才能删除自定义系统模型。

**团队安装模型**

1. 有团队模型创建权限的成员从插件模板或自定义配置发起安装。
2. 以 `{ teamId, model }` 查找存量实例；存在则更新并恢复 `installed`，不存在才插入。
3. 更新按 `modelId` 原地修改，禁止变更 `teamId/scope/createdByTmbId`。
4. 卸载默认改为 `installStatus=uninstalled` 且 `isActive=false`，保留 `modelId` 和业务引用。
5. 重新安装同一团队、同一模型时复用原 `modelId`。
6. 若产品确实需要永久删除，应单独提供高风险清理操作，并先统计引用和删除权限资源。

`model-refactor` 的 create/update/delete、模板选择器和协作者事务可作为实现参考，但它的删除接口会直接删除模型及权限记录，重新创建将生成新 ID；这不满足“团队安装后可卸载/重装且引用稳定”的目标。

### 5.6 更新语义、失败原子性与 ID 稳定性

| 场景 | `modelId` | `model-refactor` | 目标行为 |
| --- | --- | --- | --- |
| 单模型更新 | 有 `modelId` 时按 `_id` update；无 ID 时按 `model` upsert | 按 `id` update | 按 `modelId` 原地更新 |
| 系统 JSON 更新 | 按 `model` upsert；遗漏项仅停用 | 有 `id` 时按 `_id` upsert；无 ID 直接 insert | 已有模型优先按 ID，其次按作用域自然键接管；不删除重建 |
| 插件失败 | 更新前失败，不写数据库、不替换运行时 | 加载时吞错为空模板 | 整次更新失败，保留旧 active/模板缓存 |
| 团队安装 | 不支持 | 每次 create 都 insert，冲突按创建者作用域判断 | `{teamId, model}` update-or-insert，重装复用 ID |
| 卸载 | 自定义系统模型 hard delete | 系统/私有模型 hard delete，并删权限 | 团队实例软卸载；永久删除另设入口 |

需要额外保证：

- 数据库写入与权限 Owner 记录创建必须在同一事务内；这一点可复用 `model-refactor` 的 create 实现。
- 数据库事务提交成功后才能重载运行时缓存。
- 重载失败不能回滚已提交事务，因此 API 应返回失败并保持旧运行时缓存；后续重试重载即可收敛到数据库状态。
- 模型身份集合变化、active 状态变化、团队安装状态变化都必须触发相应缓存失效。

### 5.7 业务引用协议与运行时兼容解析

`modelId` 的引用协议更严格：调用方传 `{ modelId?, model? }`，只要存在 `modelId` 就禁止回退到旧 `model`；旧值只按供应商 `model` 查找，不使用展示名 `name`。Typed getter 同时校验存在、active 和模型类型。

`model-refactor` 的模型 DTO 使用单个裸字符串 `modelIdOrName`：值像 ObjectId 时按 ID 查，否则按全局 name Map 查。兼容 Map 同时注册供应商 `model` 和展示名 `name`；无 team 上下文的 getter 只允许系统模型，`resolveModelId(value, teamId)` 才允许返回同团队模型。

`model-refactor` 的团队兼容实现存在结构性问题：全局 Map 对重复私有名称采用 first-wins。如果先登记的是其他团队模型，后续即使传入当前 `teamId`，也不会继续搜索当前团队的同名实例。按 `tmbId` 唯一索引又允许同团队多人安装同名模型，使该问题更容易出现。

目标解析规则：

1. Canonical 业务引用始终是 `{ modelId: string }`。
2. 同时存在 `modelId` 与旧 `model` 时，只解析 `modelId`；错误 ID 不得降级。
3. 运行时解析有效 `modelId` 时不依赖名称，也不依赖 ObjectId 格式。
4. 常规旧 `model` 运行时 fallback 只解析系统模型，保持历史语义并避免跨团队泄露。
5. 团队历史模型的旧引用只在迁移或带明确资源 `teamId` 的兼容入口解析，使用作用域键 `{ teamId, model }`，不能使用全局 first-wins Map。
6. 如果同一资源上下文中系统模型和团队模型都能匹配旧值，迁移必须记录 ambiguity/conflict，不能静默改变历史路由。
7. 展示名 `name` 不作为业务身份或通用旧引用兼容键；只有明确确认某类历史记录保存过 alias 时，才在该迁移步骤单独启用 name fallback。

团队安装实例的新引用天然没有兼容歧义：安装接口返回 `modelId`，所有新 App、Dataset、Workflow 和 Usage 直接写该 ID。

### 5.8 Canonical 写入边界与迁移覆盖

`modelId` 已在以下写入边界调用 `formatModels`：应用创建、工作流发布、导入和服务端工作流转换。它会把旧 workflow key 改为 `modelId` key，并只在成功得到 `modelId` 后删除 chatConfig 中的旧 `model`。这能阻止迁移期间继续产生新的 legacy-only 数据。

`model-refactor` 没有同等的 canonical 写入屏障，主要依赖迁移脚本和运行时兼容；旧客户端仍可能继续写入旧字段。该方案更利于热升级回滚，但会延长双协议存在时间。

迁移能力对比：

| 能力 | `modelId` 4163 回填 | `model-refactor` 4170 初始化 |
| --- | --- | --- |
| dry-run | 支持 | 不支持 |
| 并发保护 | 字段快照/CAS，统计冲突 | App/AppVersion 使用 CAS，其他步骤各自处理 |
| Dataset/App/AppVersion | 覆盖 | 覆盖 |
| AppTemplate | 覆盖 | 未覆盖 |
| Evaluation | 覆盖 | 覆盖 |
| 模型权限 | 补 `resourceId` | 补 `resourceId` |
| 历史 Usage | 按已确认范围不回填 | 回填 `modelId`，保留旧 `model` |
| 模型文档 | 启动 repair 归一化系统模型 | 迁移脚本扁平化并推导系统/私有模型 |
| Channel/Default | 不在本次范围 | 一并迁移 |

团队安装加入后，当前 4163 回填不能继续使用全局 `modelIdByModel`，需要扩展为：

- `systemModelIdByModel: Map<model, modelId>`。
- `teamModelIdByModel: Map<teamId:model, modelId>`。
- 每条 Dataset、App、AppVersion、AppTemplate、Evaluation 和模型权限记录都从自身或所属资源读取 `teamId`。
- 旧值只匹配系统模型时写系统 ID；只匹配本团队模型时写团队 ID；两者同时匹配时记录 conflict，等待人工规则或二次脚本处理。
- 已有 canonical `modelId` 永不覆盖；非法 string ID 也不能被当作名称重新解释，除非专门处理已知历史污染。

`model-refactor` 的 4170 `buildModelNameToIdMap` 明确只读取 active 系统模型，因此它不会把旧引用迁移到团队模型；其迁移主体也把 ObjectId 格式作为 canonical ID 判断。这两点都不能直接移植。

上线流程继续沿用已确认策略：应用代码先兼容旧字段并开始 canonical 写入，上线后执行带 dry-run 的回填脚本。历史 Usage 本期不强制回填，但所有新 Usage 必须写 `modelId`，并允许按团队模型 ID 统计。

### 5.9 团队权限语义与后端校验边界

现有两套权限语义不同：

**`modelId`**

- 所有模型都是系统模型。
- 团队 owner/root 可获取全部 active 模型。
- 普通成员对未配置权限的模型默认允许；一旦配置权限，只允许命中的成员、群组或组织。
- 权限只作用于 `getMyModels/getMyModel` 和前端可选范围，运行时 getter 不查成员权限。

**`model-refactor`**

- 系统模型平台只读可见。
- 非系统模型由创建者 `tmbId` 独占 Owner 权限；团队 owner 不自动获得其他成员模型的管理权。
- 同团队其他成员只有配置协作者后才能看见；未配置时默认仅创建者可见。
- 多个运行入口调用 `authModel/authModels`，在后端同时校验团队和细粒度资源权限。
- 资源上下文允许通过可读 App/Dataset 回显已引用模型。

对于真正的团队安装模型，建议语义是：

1. 模型归属团队，不归属创建者；团队 owner/root 始终具有管理权。
2. 安装、更新、卸载要求团队模型管理权限；`createdByTmbId` 只记录审计人。
3. 同团队未配置协作者时默认可使用，沿用本期 `modelId` 的简单权限规则；配置后按成员/群组/组织限制列表和选择器。
4. 不同团队永远不可获取或运行该模型。
5. 本期后端运行不查询协作者权限表，但必须做租户边界校验：系统模型直接允许；团队模型要求 `model.teamId === executionTeamId`。
6. `getMyModel` 应区分“不存在”和“存在但无权限”，让前端显示已引用模型无权限提示；不能全部伪装成不存在。

第 5 点不是扩大细粒度权限范围，而是最低限度的多租户数据隔离。`model-refactor` 的 `authModelsByTmbId` 可以作为调用点清单，但实现可简化为批量 `modelId + teamId` scope 检查，不需要本期读取协作者权限。

安装时不能照搬 `model-refactor`，仅为了表达创建者身份就写一条 Owner 权限。当前权限算法将“存在任意模型权限记录”解释为该模型已经配置过权限，这会立刻把其他未命中的团队成员排除，与“未配置默认允许”冲突。团队所有权应直接由 `model.teamId` 和团队角色推导；创建者只写 `createdByTmbId`/审计日志。只有安装请求明确要求收紧协作者时，才在事务中写初始权限记录。

### 5.10 缓存刷新与跨成员一致性

`modelId` 将成员可用 `modelIds` 存入 TmpData，TTL 为一小时，但没有只依赖 TTL：

- 模型 active 身份集合变化后调用 `clearAllMyModelsCache`。
- 模型协作者、群组、组织、成员和 owner 变化后调用 `clearMyModelsCache({ teamId })`。
- 全局模型重载只有在 active 签名变化时清理全部成员缓存，避免无意义失效。

`model-refactor` 的列表每次实时查询资源权限，没有成员模型列表缓存。它定义并刷新 `SystemCacheKeyEnum.modelPermission`，但非测试代码没有使用 `getCachedData(modelPermission)` 构建实际权限结果缓存，因此该 version key 目前只是失效脚手架，不是完整的版本缓存方案。

继续采用“不加 `permissionVersion`、写后主动删除 TmpData”的决定。加入团队安装后，失效范围应细分：

| 变更 | 必须清理的缓存 |
| --- | --- |
| 系统模型新增、启停、删除、身份变化 | 全部成员模型缓存 |
| 团队模型安装、启停、卸载、重新安装 | 该 `teamId` 全部成员模型缓存 |
| 团队模型协作者变化 | 该 `teamId` 全部成员模型缓存 |
| 团队群组、组织、成员关系变化 | 该 `teamId` 全部成员模型缓存 |
| 仅模型展示名、价格或普通配置变化 | 模型运行时/详情缓存更新；成员 ID 列表无需失效 |

安装实例的数据库写入、Owner/协作者记录写入和缓存删除应尽量放在同一事务内；运行时全局缓存只在事务提交后重载。缓存删除失败时接口不能假装完全成功，至少应记录错误并触发重试或让调用失败，以免一小时内继续显示错误权限。

此外，`model-refactor` 把所有团队模型加载进进程级全局 Map。可以继续这样做以降低本期改造量，但运行时 getter 必须接收 `teamId` 做 scope 检查；未来团队模型规模上升后，再评估按团队懒加载或分层缓存。

### 5.11 模型列表、选择器与团队模型可发现性

`modelId` 的 `getMyModels/getMyModel` 和选择器已经解决分页后的几个关键问题：

- 列表返回 provider 全集，选择器可发现非首屏 provider。
- 已选 `modelId` 不在当前页时通过单模型接口回显。
- 调用方传兼容白名单时会取全量候选再过滤，并只从命中模型派生 provider。
- 选择值统一写 `modelId`，旧 `model` 只用于兼容白名单判断。

`model-refactor` 支持系统/团队模型列表、服务端搜索、滚动分页、创建者和权限信息，也能通过 detail/resourceContext 回显已引用模型。但其 `list` 白名单只过滤当前已加载页面，合法候选如果未出现在 loaded pages 中，需要用户搜索或继续滚动才能出现。

目标列表与 UI：

1. 普通模型选择器返回 active 系统模型和当前团队 active/installed 模型，再应用成员权限过滤。
2. 列表项统一使用 `modelId`；可附带 `scope`、团队来源和无权限状态，不返回另一套 `id`。
3. 已选模型不在当前页时按 `modelId` 获取详情；跨团队模型拒绝，当前团队无成员权限时返回可识别的无权限状态。
4. 白名单模式继续使用 `modelId` 全量交集，不能只过滤已加载页。
5. 管理页明确拆分“系统模型”“团队已安装”“可安装模板”：模板不是运行时模型，也不能进入业务选择器。
6. 安装按钮调用团队安装 API；已安装模板应展示当前实例状态，重新安装复用原 `modelId`。
7. 团队模型按 provider 和类型参与普通选择器，但应有团队标识，避免与同名系统模型混淆。

### 5.12 Usage、Pro 和 Benchmark 联动

Usage：

- `modelId` 已让所有新模型 Usage 写入 `modelId`，Schema 保留旧 `model`，按已确认范围不批量迁移历史 Usage。
- `model-refactor` 同样写 `modelId`，并增加模型 Usage 日志、统计接口和历史 Usage 回填。
- 团队安装后，Usage 必须同时保留记录自身的 `teamId` 和安装实例 `modelId`。这样即使不同团队安装相同 provider model，也能准确归属。
- 历史仅有 `model` 的 Usage 无法可靠区分同名系统/团队实例，不能按当前团队模型强行归属；可以继续按旧名称展示，或单列为 legacy/unknown。

Pro：

- 当前 `modelId` Pro 接口和辅助生成已使用 `modelId` 与嵌套 `config`；Benchmark 也构造 canonical `modelId + config` 模型。
- `model-refactor` Pro 采用 `id` 和平铺模型字段，并增加 Admin 模型、Channel、Usage 监控页面。
- 团队安装需要扩展现有 Pro 协作者 API：校验模型属于当前团队、团队 owner 可管理、写后清理团队成员模型缓存。不能继续假设所有目标都是系统模型。
- Admin 侧可选择性移植模型总量、系统/团队数量和 Usage 统计，但这不是团队安装首版的阻塞项。

连接配置：

- `modelId` 仍把 `requestUrl/requestAuth` 放在模型实例上。
- `model-refactor` 把连接、凭据和路由拆到 Channel，并按系统/团队分组。
- 如果首版每个团队安装实例只需要一个连接，可以继续把连接配置放在实例上，但返回普通模型 DTO 时必须脱敏。
- 如果需要同一团队模型的多凭据、权重、故障转移或渠道监控，再单独引入 Channel；它不是稳定 modelId 或团队安装实例成立的前置条件。

### 5.13 两个方案的可合并边界

两个分支不能整体 cherry-pick：模型类型路径、DTO 字段名、平铺/嵌套结构、API 路由、默认模型、Channel 和 Pro 管理端都不兼容。

建议从 `model-refactor` 选择性移植：

- 插件模板缓存和模板查询 API，但改为 fail-fast 发布。
- 团队模型创建/编辑 UI、系统/团队双 Tab 和模板选择交互。
- 模型写入与可选协作者/审计写入的事务结构；不照搬创建者 Owner 记录语义。
- 重复键错误映射、更新冲突预检和审计日志。
- 列表/detail 的团队模型字段、服务端搜索和已选模型回显。
- 运行入口中已有的模型批量检查调用点，仅实现团队 scope 隔离，不移植细粒度运行权限。

继续保留 `modelId`：

- 外部字段统一为 `modelId: string`。
- 公共字段 + 嵌套 `config` 的数据结构。
- 插件加载/热更新失败不发布新状态。
- 系统模型按自然键原地接管和 JSON 更新不删除重建。
- `formatModels` canonical 写入屏障。
- 4163 dry-run、CAS、冲突统计和 AppTemplate 覆盖。
- TmpData 主动失效，不引入 `permissionVersion`。
- 本期默认模型字段和单连接配置，除非另开 Channel/DefaultModel 范围。

不能直接移植：

- 非系统模型按 `tmbId` 唯一和创建者独占 Owner。
- 团队模型 hard delete/recreate。
- 将插件失败吞成空模板列表。
- ObjectId 格式作为 API 合约。
- 全局 first-wins alias/name 兼容 Map。
- 平铺模型字段 + `strict:false`。
- 所有运行入口的细粒度协作者权限校验。
- 尚无消费者的 `modelPermission` version key 脚手架。

### 5.14 推荐方案与必须补齐项

推荐以当前 `modelId` 为主干，引入“团队作用域安装实例”，而不是改成 `model-refactor` 的创建者私有模型。

目标关系：

```text
Plugin Model Template
        │ install
        ▼
Team Model Instance ── modelId ──► App / Dataset / Workflow / Usage
        │
        ├── teamId ownership and runtime isolation
        ├── member/group/org visibility permissions
        └── installed/uninstalled lifecycle
```

必须补齐项按实施顺序排列：

1. **数据模型**：模型 Schema 支持 `scope=team`、`teamId`、`createdByTmbId`、`installStatus`；团队索引改为 `{ scope, teamId, model }` 唯一。
2. **模板层**：插件结果作为可安装模板缓存；启动和热更新继续 fail-fast，缓存发布保持原子性。
3. **安装 API**：新增团队安装接口，按 `{ teamId, model }` update-or-insert；返回 `modelId`。创建人只写审计；安装时显式配置协作者才在事务内写权限记录。
4. **更新和卸载**：按 `modelId` 原地更新；PR3 再决定团队卸载是否保留实例，本 PR 不提前引入软删除语义。
5. **运行时**：全局 ID Map 纳入团队模型；所有执行入口传入 `teamId`，强制系统模型或同团队模型，暂不查询成员协作者权限。
6. **列表权限**：系统模型沿用当前规则；团队模型只进入所属团队列表，未配置默认允许，配置后按协作者过滤；团队 owner/root 可管理全部团队实例。
7. **缓存**：系统变更清全部，团队安装/权限/成员关系变更只清该团队；不增加 `permissionVersion`。
8. **选择器和管理页**：选择值只写 `modelId`；管理页拆分系统、团队已安装、可安装模板；已选无权限模型显示明确提示。
9. **迁移**：4163 增加模型 scope/owner 迁移和 team-scoped Map；保留 dry-run、CAS、unresolved/conflict 报告，不能用全局 name first-wins。
10. **Usage/Pro**：新 Usage 记录团队实例 ID；Pro 协作者和管理接口适配团队所有权；Benchmark 继续使用 canonical DTO。
11. **测试**：覆盖同一 provider model 被多个团队安装、同团队重复安装复用 ID、插件失败不改 active、卸载/重装 ID 不变、跨团队 ID 运行被拒绝、权限和模型变更立即刷新列表。

在开始实现前需要确认三个产品语义；本文给出推荐默认值：

1. 团队模型归团队而非创建者，团队 owner 始终可管理：**推荐确认**。
2. 未配置协作者时团队成员默认可使用，配置后收紧：**推荐沿用当前规则**。
3. 普通卸载保留实例和 modelId，永久删除另设入口：**推荐确认**。

## 6. 按三个 PR 拆分后的预留空间评估

计划拆分为：

1. PR1：系统模型业务引用由 `model` 迁移为 `modelId`。
2. PR2：新增模型改为“模板 → 安装实例”，不再预装全部插件模型。
3. PR3：支持团队安装模型。

从这个顺序看，当前 PR1 的业务引用层基础是正确的，但持久化和管理写接口还需要收紧。否则 PR2 会再次修改模型身份入口，PR3 还会再次修改系统/团队的作用域语义。

### 6.1 已经预留良好的部分

| 当前设计 | 对后续 PR 的价值 | 结论 |
| --- | --- | --- |
| 新业务数据统一写 `modelId` | 系统安装实例和团队安装实例都能使用同一引用协议 | 保留 |
| `modelId` 与 provider `model` 分离 | 安装实例可稳定引用，同时请求上游仍使用 `model` | 保留 |
| Getter 接收 `{ modelId?, model? }` 对象 | PR3 可在对象或解析上下文中增加 `teamId`，无需改成另一套裸字符串协议 | 保留 |
| 显式 `modelId` 无效时不回退 `model` | 防止团队模型 ID 错误时静默命中同名系统模型 | 保留 |
| 下游请求链尽早解析成完整 `modelData` | 团队 scope 校验可集中在解析入口，大多数 LLM/Embedding 调用链不用再次重写 | 保留 |
| 公共字段 + 类型化 `config` | 模板和安装实例可以共享配置 Schema，且模板字段不能覆盖实例公共字段 | 保留 |
| 权限记录改用 `resourceId=modelId` | PR3 可继续沿用同一资源权限表 | 保留 |
| 成员模型缓存支持按团队主动失效 | PR3 可扩展为系统变更清全部、团队实例变更清单团队 | 保留 |
| 4163 dry-run、CAS 和 canonical 写入屏障 | PR3 只需补 team-scoped 映射，不必重写迁移框架 | 保留 |

当前 `SystemModel*` 类型名、`global.systemModelMap` 和 `system_models` 物理集合名虽然偏系统化，但不是数据协议阻塞项。本 PR 不需要为了未来团队模型大范围改名；只要模型解析被封装在 getter 后面，PR3 可以局部引入通用模型仓储或团队缓存。

### 6.2 `isSystem` 改为 `scope`：建议在 PR1 完成

同意将：

```ts
isSystem: true;
```

改成：

```ts
scope: ModelScopeEnum.system;
```

原因不是单纯为了把 boolean 改成 enum，而是明确表达“模型实例属于哪个所有权和可见性空间”。后续可自然增加 `team`，且不需要让 `false` 同时承担团队、个人或其他未来作用域。

边界需要同时明确：

- `scope` 只属于**已经安装的模型实例**；插件模板不是模型实例，不要增加 `scope=template`。
- PR1 的持久化和 API Schema 仍使用 `z.literal(ModelScopeEnum.system)`，不能因为预留枚举而提前接受团队模型写入。
- PR1 唯一索引使用 `{ scope: 1, model: 1 }`，partial filter 为 `scope=system`。
- PR3 再增加 `{ scope: 1, teamId: 1, model: 1 }`，partial filter 为 `scope=team`。
- 所有批量启停、默认模型更新、删除和列表查询都显式带 `scope=system`，避免 PR3 上线后系统接口误修改团队实例。
- `isCustom` 仍只能表示“是否命中插件模板”，不能替代 `scope`。

物理集合可以暂时继续叫 `system_models`，以避免 PR1 增加一次无业务价值的集合迁移；PR3 若决定系统和团队实例共表，再通过代码别名或独立迁移统一命名。

### 6.3 单模型更新：同意只按 `modelId` 更新，但必须拆开创建语义

当前 `update` 接口的 `modelId` 可选；缺少 ID 时按 `model` upsert。这会把“更新已有实例”和“创建/安装新实例”混在一起，不利于 PR2 引入模板安装。

建议 PR1 将更新接口收紧为：

1. `modelId` 必填且只接受非空 string。
2. 查询条件为 `{ _id: modelId, scope: system }`。
3. `upsert=false`，未命中返回模型不存在。
4. 请求体使用 canonical Schema 严格校验，不再调用 legacy repair。
5. `scope` 不可修改；PR3 的 `teamId/createdByTmbId` 同样属于不可修改字段。
6. `model` 若允许修改，只是 provider 路由配置变化；更新前仍需检查系统作用域自然键冲突。

但是不能只把当前字段改成必填：现有新增自定义模型 UI 也复用了 `update` 且不传 `modelId`。需要二选一：

- **推荐**：PR1 就拆出显式 `create` 接口；PR2 再将插件模型创建替换为模板安装，自定义模型继续走 create。
- 或者在 PR2 合并前暂时保留旧创建分支，但把代码明确拆成独立函数，不能继续称为 update/upsert。

### 6.4 JSON 更新：只接受最新裸数组格式，同时支持跨实例搬运

本 PR 不引入 `schemaVersion`，导入和导出统一使用最新 canonical 模型数组。兼容边界由记录内容而不是版本号决定：旧格式通常没有 `modelId`，这类记录直接过滤；保留下来的记录必须通过当前 strict Zod Schema，不能 repair 或静默接受未知字段。

完整规则为：

1. 顶层必须是数组，每类模型对象使用 strict Zod Schema；导出包含 `modelId`、`scope` 和完整 canonical 配置。
2. 缺少非空 `modelId` 的旧记录先过滤，不参与更新、创建或后续启停计算。
3. 如果原数组非空但过滤后为空，整次导入按 no-op 处理，防止旧配置文件误停用全部模型。
4. `modelId` 在目标实例存在时，只按 `{ _id: modelId, scope: system }` 原地更新，不因 `model` 变化生成新 ID。
5. `modelId` 在目标实例不存在时，按 `{ scope: system, model }` 查找：同名实例存在则复用目标实例原 ID；不存在则创建新实例。这是明确的跨实例导入语义，而不是单模型更新接口的兼容回退。
6. payload 内不得有重复 `modelId` 或重复 `model`；写入必须在事务中完成。
7. 未出现在有效导入记录中的系统模型继续按旧逻辑停用，但过滤掉的旧记录不能参与该集合计算，且绝不能影响未来 `scope=team` 模型。
8. JSON API 不调用 `repairSystemModelDocument`，也不使用插件模板补字段；输入自身必须满足最新 canonical Schema。

### 6.5 启动迁移、插件模板刷新、自动预装和数据库实例加载的职责边界

“启动已经洗完模型数据”是收紧 update/JSON 接口的前提。本 PR 已将原来集中在 `loadSystemModels(true)` 内的职责拆开，避免管理接口、Change Stream 和五分钟任务重复执行 repair。

建议把当前加载流程拆成四个可独立验证的职责：

1. `migrateLegacySystemModels()`——**只改变数据库结构，不产生运行时缓存**。
   - 触发：进程启动的升级初始化阶段，且在任何业务请求可用之前执行；不能被管理接口、Change Stream 或定时任务重复调用。
   - 输入：原始 `system_models` 文档，以及已成功取得的模板快照中确实需要用于识别旧字段的最小信息。
   - 输出：`scope=system`、顶层管理字段和类型化 `config` 的 canonical 文档；接管同名旧文档时保留 `_id`。
   - 失败：启动失败，不发布模型缓存；不得留下“数据库迁移一半但服务已可用”的状态。迁移本身保持幂等，允许重启重试。

2. `refreshModelTemplates()`——**只管理插件模板快照，不写模型实例**。
   - 触发：启动时一次，以及运行期插件刷新任务。
   - 输入：插件服务返回的完整模板列表。
   - 输出：先在局部变量中完成去重和 Schema 校验，作为候选快照返回；数据库实例加载也成功后，再与 active 缓存一起发布。
   - 失败：启动时阻止服务启动；热刷新时保留上一版模板缓存和 active 模型缓存，不调用删除、停用、预装或实例重载。

3. `syncPreinstalledSystemModels()`——**只实现当前版本的自动预装策略**。
   - 触发：仅在模板刷新成功之后；管理接口保存模型不应隐式触发全量预装。
   - 输入：已验证的模板快照和数据库当前系统实例。
   - 输出：按 `{ scope:system, model }` 仅创建缺失实例，已有实例保留 `_id` 和管理员配置；并发依赖唯一索引收敛。
   - 删除边界：模板消失不在这里删除或停用实例。PR2 停止“预装所有模板”时，只替换这一层为显式模板安装，迁移、模板刷新和实例加载无需改语义。

4. `loadInstalledModels()`——**只从数据库构建运行时实例快照**。
   - 触发：启动迁移和预装完成后、管理员写事务提交后、数据库实例 Change Stream 事件后。
   - 输入：`scope=system` 的数据库实例；插件模板仅用于派生 `isCustom/avatar` 等非权威展示信息，不补写或覆盖实例配置。
   - 输出：严格 parse 全部实例，在局部构建 list/map/defaults；全部成功后再原子发布。解析失败时保留上一版运行时缓存并报错。
   - 禁止事项：不做 legacy repair、不拉插件、不创建模型、不执行安装/卸载策略。

对应编排顺序：

```text
启动：refresh templates -> migrate legacy -> sync preinstalled -> load installed -> publish ready
热刷新模板：refresh templates -> sync preinstalled -> load installed（任一步失败均保留旧快照）
管理员写入：validate/preflight -> transaction -> load installed
PR2 安装：refresh templates（独立） -> install one template -> load installed
```

安装实例必须是可独立运行的完整快照。插件模板可以用于首次创建、恢复默认值或显式升级，但不应在每次运行时加载时与数据库 `config` 隐式合并；否则 PR2 中模板变化会绕过安装/更新动作直接改变存量实例行为。

插件失败语义继续遵循已确认规则：启动失败；热更新不发布新的模板或 active 缓存；不得因为插件返回失败或空列表而删除、停用或重建数据库实例。

### 6.6 删除语义：本 PR 维持旧逻辑的硬删除边界

本版本只允许删除当前插件模板中已经不存在的模型，即运行时 `isCustom=true` 的系统模型。删除是完全删除，不增加 `installStatus` 或软删除状态；模型文档及其模型权限资源在同一事务中删除。仍在插件模板中的预装模型不能通过该接口删除。

这个选择明确接受“删除后重建会生成新 ID、旧引用失效”的风险。PR2 的模板卸载和 PR3 的团队卸载属于新的生命周期语义，应分别设计，不能反向改变本 PR 管理员删除接口的已确认行为。

### 6.7 `modelId: string` 已统一收口

包括默认模型接口在内，管理 API 和领域类型统一只要求非空 string；`updateDefault.ts` 不再显式执行 `new Types.ObjectId(modelId)`。

MongoDB 当前继续用 ObjectId 生成 `_id` 没有问题；需要移除的是 API 和领域层对 ObjectId 格式的依赖。如果未来真的要在数据库中生成非 ObjectId 字符串 `_id`，则还需要单独修改 Mongoose `_id` Schema 和聚合比较逻辑，不能只改 TypeScript 类型。

### 6.8 三个 PR 的建议责任边界

**PR1 本次完成**：

- canonical `modelId` 引用、旧系统 `model` 只读兼容和 4163 回填。
- `scope=system` 及系统作用域索引/查询边界。
- update 只按 ID；创建从 update 语义中拆开。
- JSON 使用无版本的最新严格数组协议；有 ID 时原地更新，跨实例未知 ID 按 `model` 创建或复用目标实例。
- legacy repair 只在升级初始化执行，日常管理写入不再 repair。
- 只允许硬删除已不在插件中的模型，并同步删除其权限资源。
- 所有外部 `modelId` Schema 统一为非空 string，不残留 ObjectId 格式校验。
- 模板获取、自动预装策略和数据库运行时加载至少在函数职责上分离。

**PR2 再实现**：

- 模板缓存和模板 API。
- 停止自动物化所有模板；现有数据库模型全部原地保留为已安装实例。
- 模板安装、显式升级、停用和卸载；恢复安装复用原 `modelId`。
- 持久化模板关联标识或来源信息；不要继续用瞬时 `isCustom` 承担来源关系。
- 明确模板变化是否自动影响实例；推荐安装时快照、显式升级。

**PR3 再实现**：

- `scope=team`、`teamId`、`createdByTmbId` 和团队作用域唯一索引。
- 团队安装/更新/卸载 API 和管理页。
- 系统模型 + 当前团队模型列表、协作者可见性和团队缓存失效。
- 所有运行入口的 `modelId + executionTeamId` 租户边界检查。
- 4163/后续迁移增加 `{ teamId, model }` scoped Map；禁止全局名称 first-wins。

本阶段不建议提前做：把模板写进模型实例表、增加 `scope=template`、加入未使用的团队权限记录、引入 `permissionVersion`，或为了命名统一而一次性重命名全部 `SystemModel*` 类型。

### 6.9 总体判断

当前 PR 的引用层可以作为三个 PR 的稳定底座：管理写入口已经拆成 create 与 ID-only update，加载器也已经分离模板同步、启动 repair、自动预装和数据库实例加载。

在 PR1 完成 `scope`、ID-only update、最新格式严格 JSON、一次性迁移边界和受限硬删除语义后，PR2 主要是在已有系统实例之上增加模板安装与来源，PR3 主要增加团队作用域与隔离，不需要再次迁移业务模型引用。

## 7. TODO

- [x] 建立差异核查大纲。
- [x] 填写模型身份、存储和生命周期差异。
- [x] 填写引用、迁移和兼容差异。
- [x] 填写团队权限、缓存和选择器差异。
- [x] 给出团队安装模型的目标语义和实施清单。
- [x] 复核代码证据、格式和结论一致性。
- [x] 按三个 PR 的拆分顺序复核当前 PR 的演进空间。
