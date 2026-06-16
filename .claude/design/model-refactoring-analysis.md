# 模型重构分析报告

> 分支对比: `origin/develop-1.4.0` vs `origin/develop-1.3.0`
> 影响: **675 个文件，+30891 / -13089 行**

---

## 一、重构目的

本次重构解决旧模型体系的三个核心问题：

1. **模型标识不稳定** — 旧方案以 `model` 字段（如 `"gpt-4o"`）作为唯一标识和查找 key。当多个自定义模型共用同一个 OpenAI model 名时（如团队 A 和团队 B 各自配置了不同参数的 `gpt-4o`），唯一索引会冲突，无法区分。
2. **缺乏权限控制** — 所有模型对所有用户可见，无法实现「团队私有模型」「模型共享」等场景。
3. **数据结构不规整** — 旧方案将模型配置放在嵌套的 `metadata` 对象中，schema 校验依赖运行时解析，字段散落在嵌套对象内外，类型安全差。

---

## 二、重构设计

### 核心思路

**用不可变的 `_id` 替代可变的 `model` 名作为模型的唯一标识和关联 key。**

```
旧:  model 名字 = 唯一标识 + 查找 key + 关联外键
新:  _id        = 唯一标识 + 查找 key + 关联外键
     model 名字 = 仅用于调用 AI API 时的 model 参数
```

### 关键设计决策

| 决策 | 说明 |
|------|------|
| **`_id` 作为引用 key** | App、Dataset、Evaluation 等所有引用模型的地方，从存 model 名字改为存 model `_id` |
| **metadata 扁平化** | `metadata.type`, `metadata.maxContext` 等全部提升到文档顶层，Zod schema 直校验 |
| **系统模型入库** | 插件定义的模型通过 `bulkWrite upsert` 自动持久化到 MongoDB，使其拥有 `_id` |
| **权限模型** | 新增 `PerResourceTypeEnum.model`，自定义模型支持 Owner/Collaborator/Shared 控制 |
| **数据迁移一并完成** | `initv4150` 9 步脚本将存量 model 名字批量转换为 model id |

### 重构前后数据流对比

#### 旧数据流

```
┌──────────────────────────────────────────────────────────┐
│  启动时: 加载插件模型 → 存入 llmModelMap (key = model名)   │
│          加载 DB 自定义模型 (metadata 嵌套) → 同上          │
└──────────────────────────────────────────────────────────┘
App/Dataset 存储 model 名字 "gpt-4o"
       ↓
getLLMModel("gpt-4o") → llmModelMap.get("gpt-4o")  // 通过 model 名查找
       ↓
返回 LLMModelItemType（包含 maxContext, vision 等配置）
       ↓
实际调用 AI 时取 modelData.model 作为 OpenAI API 的 model 参数

❌ 问题: model 名"gpt-4o"在 Map 中只能存一份,第二个同名的自定义模型会覆盖
```

#### 新数据流

```
┌──────────────────────────────────────────────────────────────┐
│  启动时: 插件模型 bulkWrite upsert 入 DB (获得 _id)            │
│          加载所有 DB 模型 → leanToModelItem() 清洗空值          │
│          → normalizeSystemModel() Zod 校验/补默认值             │
│          → 存入 llmModelIdMap (key = _id) + systemModelIdMap   │
└──────────────────────────────────────────────────────────────┘
App/Dataset 存储 model id "68ad85a7463006c963799a05"
       ↓
getLLMModelById("68ad85a7463006c963799a05") → llmModelIdMap.get("68ad85a7463006c963799a05")
       ↓
返回 LLMModelItemType（id + model + 所有配置字段）
       ↓
实际调用 AI 时取 modelData.model 作为 OpenAI API 的 model 参数

✅ 不同自定义模型即使共享 model 名, _id 始终唯一
```

#### 计费链路变更

```
旧: formatModelChars2Points({ model: "gpt-4o", ... })
      → findAIModel("gpt-4o") 遍历 5 个 Map 查找

新: formatModelChars2Points({ modelId: "68ad85a...", ... })
      → getModelById("68ad85a...") 直接查 systemModelIdMap
```

---

## 三、涉及的核心模块

| 模块 | 关键目录 |
|------|---------|
| **AI 模型配置** | `packages/service/core/ai/config/` (schema, utils), `packages/service/core/ai/model.ts`, `packages/service/core/ai/type.ts` |
| **知识库** | `packages/global/core/dataset/`, `packages/service/core/dataset/` |
| **工作流编排** | `packages/global/core/workflow/` (constants, utils, templates) |
| **应用配置** | `packages/global/core/app/` (type, constants, formEdit) |
| **权限系统** | `packages/global/support/permission/`, `packages/service/support/permission/` |
| **评测/评估** | `packages/global/core/evaluation/`, `packages/service/core/evaluation/` |
| **模型训练** | `packages/global/core/train/`, `packages/service/core/train/` |
| **前端组件** | `projects/app/src/components/core/ai/ModelTable`, `pageComponents/` |
| **API 接口** | `projects/app/src/pages/api/core/ai/model/` 等 50+ API 文件 |
| **计费/用量** | `packages/service/support/wallet/usage/`, `packages/global/support/wallet/usage/` |

---

## 四、DB Schema 关键变更

### 1. `system_models` 表（最核心变更）

**旧结构** (`SystemModelSchemaType`):
```typescript
{
  _id: string;
  model: string;      // 唯一索引, 如 "gpt-4o"
  metadata: {         // 所有配置塞在一个嵌套对象里
    type, provider, name, avatar, isActive, maxContext, ...
  }
}
```

**新结构** (`SystemModelItemType`):
```typescript
{
  _id: string;             // 作为模型的 "id" 暴露
  id: string;              // 代码层面 = String(_id)，扁平化后不再有 metadata
  model: string;           // 不再唯一（多个自定义模型可共享同一个 OpenAI model 名）
  type, provider, name, avatar, isActive, ...
  maxContext, maxResponse, vision, functionCall, ...  // 全部扁平化到顶层
  tmbId: string;           // 新增：创建者
  teamId: string;          // 新增：所属团队
  isShared: boolean;       // 新增：是否共享
  isCustom: boolean;       // 新增：是否自定义模型
}
```

**Schema 变化细节**:
- 移除旧的 `{ model, metadata }` 结构，base 字段 + price 字段声明在 Schema 顶层
- `strict: false` 允许类型特有字段（如 `maxContext`、`voices`、`dimensions`）动态存储
- 新增索引: `teamId_1`, `tmbId_1`, `isShared_1`
- 丢弃 `model` 字段的 unique 索引

### 2. `datasets` 表

| 旧字段 | 新字段 | 备注 |
|--------|--------|------|
| `vectorModel: string` | `vectorModelId: string` | 从存储 **模型 model 名** 变为存储 **模型 _id** |
| `agentModel: string` | `agentModelId: string` | 同上 |
| `vlmModel: string` | `vlmModelId: string` | 同上 |

**Mongoose Schema 变化**:
- `default: 'text-embedding-3-small'` → 不再设置 default（改为 required 校验）
- `default: 'gpt-4o-mini'` → 不再设置 default（改为 required 校验）
- folder 类型数据集不再要求 `vectorModelId`/`agentModelId`

### 3. 评估相关表

| 表/类型 | 旧字段 | 新字段 |
|----------|--------|--------|
| `EvalDatasetDataQualityMetadata` | `model` | `modelId` |
| `EvalDatasetDataSynthesisMetadata` | `intelligentGenerationModel` | `intelligentGenerationModelId` |
| `EvalDatasetCollectionSchemaType` | `evaluationModel` | `evaluationModelId` |
| `RuntimeConfig` | `llm`, `embedding` | `llmId`, `embeddingId` |

### 4. 用量表 `usage_items`

| 旧字段 | 新字段 |
|--------|--------|
| `model?: string` | `modelId?: string` |

### 5. 训练任务表 (`embedding_train_tasks`, `rerank_train_tasks`)

`baseModelId`、`checkpoint.data.registering.tunedModelId`、`result.tunedModelId` 字段的值从 model 名转换为 model id。

---

## 五、工作流/应用配置中关键数据命名变更

### 工作流常量 `NodeInputKeyEnum`

| 旧枚举名 → 新枚举名 | 旧 value → 新 value |
|---------------------|---------------------|
| `aiModel` → `aiModelId` | `'model'` → `'modelId'` |
| `datasetSearchEmbeddingModel` → `datasetSearchEmbeddingModelId` | `'embeddingModel'` → `'embeddingModelId'` |
| `datasetSearchRerankModel` → `datasetSearchRerankModelId` | `'rerankModel'` → `'rerankModelId'` |
| `datasetSearchExtensionModel` → `datasetSearchExtensionModelId` | `'datasetSearchExtensionModel'` → `'datasetSearchExtensionModelId'` |
| `generateSqlModel` → `generateSqlModelId` | `'generateSqlModel'` → `'generateSqlModelId'` |
| `datasetDeepSearchModel` → `datasetDeepSearchModelId` | `'datasetDeepSearchModel'` → `'datasetDeepSearchModelId'` |
| `datasetAgenticSearchLLMModel` → `datasetAgenticSearchLLMModelId` | `'agenticSearchLLMModel'` → `'agenticSearchLLMModelId'` |
| `datasetAgenticSearchRerankModel` → `datasetAgenticSearchRerankModelId` | `'agenticSearchRerankModel'` → `'agenticSearchRerankModelId'` |

移除枚举: `useEditDebugSandbox`

### `workflow/utils.ts` 新增工具函数

**`extractWorkflowModelIds()`** — 从工作流 modules 和 chatConfig 中提取所有引用的 model id:
```
遍历 modules[].inputs[] → 匹配 workflowModelInputKeySet (8 个 model key)
    ├── 直接 model 值 → addModelId()
    └── datasetParams 复合对象 → 遍历 datasetParamsModelKeySet (6 个 key)
遍历 chatConfig.questionGuide.modelId, chatConfig.ttsConfig.modelId
返回 Array.from(modelIds)
```
用途：模型删除时的引用检查，以及权限过滤时的批量校验。

**`removeUnauthModels()` 重构**:
- 从只处理 `key === 'model'` 的单一判断 → 使用 `workflowModelInputKeySet` 匹配所有 8 种 model key
- 新增 `datasetParams` 复合对象内嵌 model 字段的权限过滤
- 使用 `checkInputIsReference()` 统一判断引用类型输入

### 应用配置类型变更

| 类型.旧字段 | 新字段 |
|------------|--------|
| `AppTTSConfigType.model` | `modelId` |
| `AppQGConfigType.model` | `modelId` |
| `AppDatasetSearchParamsType.rerankModel` | `rerankModelId` |
| `AppDatasetSearchParamsType.embeddingModel` | `embeddingModelId` |
| `AppDatasetSearchParamsType.datasetSearchExtensionModel` | `datasetSearchExtensionModelId` |
| `AppDatasetSearchParamsType.generateSqlModel` | `generateSqlModelId` |
| `AppDatasetSearchParamsType.agenticSearchLLMModel` | `agenticSearchLLMModelId` |
| `AppDatasetSearchParamsType.agenticSearchRerankModel` | `agenticSearchRerankModelId` |
| `SettingAIDataType.model` | `modelId` |
| `AppSimpleEditFormType.aiSettings.model` | `modelId` |
| `AppFormEditFormV1TypeSchema.aiSettings.model` | `modelId` |

### 运行时响应 `DispatchNodeResponseSchema`

| 旧字段 | 新字段 |
|--------|--------|
| `model` | `modelId` |
| `embeddingModel` | `embeddingModelId` |
| `rerankModel` | `rerankModelId` |
| `queryExtensionResult.model` | `queryExtensionResult.modelId` |
| `deepSearchResult.model` | `deepSearchResult.modelId` |
| `extensionModel` | `extensionModelId` (deprecated) |

`agenticSearchResult` 从 `z.any()` 变为结构化对象:
```typescript
z.object({
  reasoningText, searchCount, toolCallCount,
  llmModelId, llmInputTokens, llmOutputTokens,
  playbook, executionPath, confidence, queryLanguage
})
```

---

## 六、运行时全局缓存的变更

### Map 类型及变量名 (`packages/service/core/ai/type.ts`)

| 旧变量 | 新变量 | Map key 变化 |
|--------|--------|-------------|
| `llmModelMap` | `llmModelIdMap` | key 从 `model` 变为 `id` |
| `embeddingModelMap` | `embeddingModelIdMap` | 同上 |
| `ttsModelMap` | `ttsModelIdMap` | 同上 |
| `sttModelMap` | `sttModelIdMap` | 同上 |
| `reRankModelMap` | `reRankModelIdMap` | 同上 |
| (无) | `systemModelIdMap` | **新增**: 全类型统一查找 |

### 模型查找函数 (`packages/service/core/ai/model.ts`)

| 旧函数 | 新函数 | 参数变化 |
|--------|--------|---------|
| `getLLMModel(model?)` | `getLLMModelById(id?)` | model 名 → model id |
| `getDatasetModel(model?)` | `getDatasetModelById(id?)` | 同上 |
| `getVlmModel(model?)` | `getVlmModelById(id?)` | 同上 |
| `getEmbeddingModel(model?)` | `getEmbeddingModelById(id?)` | 同上 |
| `getTTSModel(model?)` | `getTTSModelById(id?)` | 同上 |
| `getSTTModel(model?)` | `getSTTModelById(id?)` | 同上 |
| `getRerankModel(model?)` | `getRerankModelById(id?)` | 同上 |
| `getEvaluationModel(model?)` | `getEvaluationModelById(id?)` | 同上 |
| `findAIModel(model)` | **删除** | — |
| `findModelFromAlldata(model)` | `getModelById(id)` | 功能简化，直接查 `systemModelIdMap` |
| (无) | `getDefaultDatasetModel()` | **新增** |

### 模型加载流程 (`packages/service/core/ai/config/utils.ts`)

```
MongoDB(扁平化) → lean() → leanToModelItem() 清洗空值 → normalizeSystemModel() Zod 校验
    ├── llmModelIdMap.set(model.id, model)
    ├── embeddingModelIdMap.set(model.id, model)
    └── systemModelIdMap.set(model.id, model)
```

**新增关键函数**:
- **`leanToModelItem()`**: 将 `_id` 转为 `id` 字段，过滤 null/undefined 值
- **`normalizeSystemModel()`**: 根据模型 type 使用对应 Zod schema 校验（`safeParse`），自动补全默认值、剔除非法字段
- **插件模型自动持久化**: 插件定义的模型通过 `bulkWrite upsert` 自动写入 MongoDB，使其拥有 `_id`；插件已移除的孤立 DB 记录会被自动清理

**Zod Schema `.default()` 值**: 许多字段现在有默认值，降低对 DB 存储默认值的依赖：
- LLM: `maxContext: 16000`, `maxResponse: 8000`, `quoteMaxToken: 8000`, `functionCall: true`, `toolChoice: true`
- Embedding: `defaultToken: 512`, `maxToken: 512`, `weight: 0`
- Rerank: `maxToken: 3000`
- TTS: `voices: []`

---

## 七、权限系统新增

### 资源类型
- `PerResourceTypeEnum.model` — 模型作为独立的权限管理资源

### 团队权限位
- `TeamPerKeyEnum.modelCreate` = `0b100000000`
- `TeamRoleKeyEnum.modelCreate`

### 新增文件

| 文件 | 作用 |
|------|------|
| `packages/global/support/permission/model/constant.ts` | Model 角色的 Owner/Read/Write 权限值定义 |
| `packages/global/support/permission/model/controller.ts` | `ModelPermission` 类，继承 `Permission` 基类 |
| `packages/service/support/permission/model/controller.ts` | 模型权限业务逻辑（协作角色合并、列表过滤） |
| `packages/service/support/permission/model/auth.ts` | 模型级权限鉴权（300 行） |
| `packages/service/support/permission/model/reference.ts` | 模型引用检查（删除前检查是否被 App/Dataset 引用） |

### 新增 API 端点

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/core/ai/model/create` | POST | 创建自定义模型，写入权限记录 |
| `/api/core/ai/model/list` | POST | 获取有读权限的模型列表（含创建者信息） |
| `/api/core/ai/model/update` | PUT | 更新模型配置 |
| `/api/core/ai/model/delete` | DELETE | 删除自定义模型（含引用检查） |
| `/api/core/ai/model/detail` | POST | 获取单个模型详情 |
| `/api/core/ai/model/updateDefault` | POST | 设置系统默认模型 |
| `/api/core/ai/model/getDefaultConfig` | POST | 获取模型默认配置 |
| `/api/core/ai/model/getConfigJson` | POST | 获取模型配置 JSON |
| `/api/core/ai/model/updateWithJson` | POST | 通过 JSON 更新模型 |
| `/api/admin/initv4150` | POST | v4.15.0 模型重构数据迁移（9 步） |

### 权限判断逻辑

```
getModelPermissionFromRole(model, teamId, tmbId, ...):
  1. Root 管理员 → isOwner=true（全部权限）
  2. 系统模型(isCustom=false):
     - isShared=true → ReadRoleVal
     - isShared=false → NullRoleVal（无权限）
  3. 自定义模型(isCustom=true):
     - model.tmbId === tmbId → isOwner=true
     - teamPer.isOwner && model.teamId === teamId → isOwner=true
     - 其他 → 按协作权限(collaboratorRole) + isShared 加成
```

---

## 八、数据迁移脚本 (`initv4150.ts`)

共 9 步，幂等可重复执行：

| 步骤 | 函数 | 迁移内容 |
|------|------|---------|
| **Step 1** | `dropModelUniqueIndex()` | 删除 `model` 字段的 unique 索引 |
| **Step 2** | `createNewIndexes()` | 创建 `teamId_1`, `tmbId_1`, `isShared_1` 索引 |
| **Step 3** | `migrateModelData()` | `metadata` 扁平化、设置 `isShared`、补全缺失默认值、孤儿模型归属 root |
| **Step 4** | `migrateDatasets()` | `vectorModel/agentModel/vlmModel` → `XxxModelId`，model 名转 model id，清理 `dataset_trainings.model` |
| **Step 5** | `migrateAppWorkflows()` | `apps.modules` + `app_versions.nodes` 的 model key/value 迁移，`chatConfig.questionGuide`/`ttsConfig` 迁移 |
| **Step 6** | `migrateEvaluationData()` | `eval_dataset_collections` 和 `eval_dataset_datas` 的 model 字段迁移 |
| **Step 7** | `migrateEvaluationTasks()` | `evals.evaluators[].runtimeConfig.llm/embedding` → `llmId/embeddingId` |
| **Step 8** | `migrateTrainingRecords()` | embedding/rerank 训练任务的 model id 转换 |
| **Step 9** | `migrateUsageRecords()` | `usage_items.model` → `modelId` |

**关键辅助函数**:
- `buildModelNameToIdMap()`: 从 `system_models` 构建 model 名 → model id 映射（同名多模型优先 active）
- `WORKFLOW_MODEL_KEY_MAP`: 8 个 model key 的旧名→新名映射常量
- `convertModelValue()`: 将 model 名字符串转换为 model id

---

## 九、影响面汇总

| 影响范围 | 核心变化 |
|----------|---------|
| `system_models` 表 | metadata 扁平化、新增权限字段、model 去唯一索引 |
| `datasets` 表 | vectorModel/agentModel/vlmModel → XxxModelId |
| 评估相关表 | model → modelId 系列重命名 |
| 工作流 node input keys | 8 个 model key 统一加 Id 后缀，新增 extractWorkflowModelIds、removeUnauthModels 重构 |
| 应用配置类型 | model → modelId |
| 运行时 dispatch 响应 | model → modelId 系列重命名，agenticSearchResult 结构化 |
| 全局 model cache | 6 个 Map 重命名，新增 systemModelIdMap，key 从 model 名变 id |
| 模型查找函数 | 11 个函数重命名/新增/删除，参数从 model 名变 id |
| 权限系统 | 新增 model 资源类型、团队位、鉴权中间件、引用检查 |
| API 接口 | 新增 CRUD + list 接口，重构权限校验，initv4150 迁移端点 |
| 计费/用量 | formatModelChars2Points 参数变 modelId，usage_items 字段重命名 |
| 数据迁移 | initv4150.ts 9 步完整迁移 (index + 8 类数据) |

---

## 十、TODO

### 1. fastgpt-plugin 中定义的工作流模板、默认模型配置需要优化

当前 `fastgpt-plugin` 中定义的工作流模板和默认模型配置仍使用旧字段名（如 `model` 而非 `modelId`），需同步更新以匹配新的数据模型。

### 2. aiproxy Channel 权限越权问题

**问题描述**: 用户 A 创建了自定义模型（`id: 00000xxx001`, `model: qwen-3.6`），未配置自定义 `requestUrl` 和 `requestAuth`；root 创建了另一个模型（`id: 00000xxx002`, `model: qwen-3.6`），同时配置了对应的 model-channel，绑定了 `model=qwen-3.6`。当用户 A 执行模型测试或产生模型调用时，会越权使用 root 配置的 model-channel 来访问 `qwen-3.6`。

**根因**: aiproxy 的 channel 匹配仅基于 `model` 名字（`qwen-3.6`），不感知 FastGPT 侧的模型 `_id` 和权限归属。用户 A 的模型调用到达 aiproxy 时，aiproxy 根据 `model` 名匹配到了 root 配置的 channel。

---

## 附录: aiproxy 渠道管理与权限隔离分析

当前 aiproxy 通过 **三层模型** 实现访问控制：Group → Token → Channel

### 数据模型关系

```
Group (组)
  ├── ID, Status, AvailableSets, RPMRatio, TPMRatio
  ├── 拥有多个 Token
  └── 拥有多个 GroupModelConfig

Token (API密钥)
  ├── 属于一个 Group
  ├── Models []string        — 限制可访问的模型
  ├── Subnets []string       — IP 白名单
  ├── Quota / PeriodQuota    — 配额控制
  └── Status                 — 启用/禁用

Channel (渠道/上游)
  ├── Type, Key, BaseURL
  ├── Models []string        — 该渠道支持的模型
  ├── Sets []string          — 渠道分组标签 (如 "default")
  ├── Priority               — 同模型多渠道时的优先级
  └── Status                 — 启用/禁用

ModelConfig (模型配置)
  ├── Model, Type, Owner
  ├── RPM, TPM              — 模型级速率限制
  └── Price                 — 定价
```

### 权限隔离机制

| 能力 | 支持程度 | 实现位置 |
|------|---------|---------|
| Token → 模型限制 | 支持 | `token_cache.go:57` FindModel() — Token 可配置允许访问的模型白名单 |
| Group → Set 隔离 | 支持 | `group.go:36` AvailableSets — Group 只能访问特定 Set 的 Channel |
| Channel → Set 分类 | 支持 | `channel.go:60` Sets — Channel 打标签归类 |
| Token → IP 限制 | 支持 | `token.go:39` Subnets — 限制 Token 使用的 IP 范围 |
| Token → 配额 | 支持 | `token.go:47-51` Quota + PeriodQuota — 总量/周期配额 |
| Group → 速率限制 | 支持 | `group.go:32-33` RPMRatio/TPMRatio + GroupModelConfig |
| Group → 模型配置覆盖 | 支持 | `group_cache.go:33` ModelConfigs — 按 Group 覆盖 RPM/TPM/Price 等 |
| Admin API 鉴权 | 单 Key | `auth.go:41` AdminAuth — 仅支持单一 AdminKey |

### 与 FastGPT 模型重构的断层

FastGPT 重构后模型以 `_id` 为唯一标识，但 aiproxy 的 channel 匹配仍然基于 `model` 名字字符串。当多个 FastGPT 模型（不同 `_id`）共用同一个 `model` 名时，aiproxy 无法区分调用来源的权限归属，存在跨用户 channel 复用风险。
