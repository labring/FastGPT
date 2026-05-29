# 模型重构分析报告

> 分支: `feat/model-management-with-permission` vs `origin/develop-1.3.0`
> 影响: **355 个文件，+6522 / -4669 行**

---

## 一、涉及的核心模块

| 模块 | 关键目录 |
|------|---------|
| **1. AI 模型配置** | `packages/service/core/ai/config/` (schema, utils), `packages/service/core/ai/model.ts` |
| **2. 知识库** | `packages/global/core/dataset/`, `packages/service/core/dataset/` |
| **3. 工作流编排** | `packages/global/core/workflow/` (constants, utils, templates) |
| **4. 应用配置** | `packages/global/core/app/` (type, constants, formEdit) |
| **5. 权限系统** | `packages/global/support/permission/`, `packages/service/support/permission/` |
| **6. 评测/评估** | `packages/global/core/evaluation/`, `packages/service/core/evaluation/` |
| **7. 模型训练** | `packages/global/core/train/`, `packages/service/core/train/` |
| **8. 前端组件** | `projects/app/src/components/core/ai/ModelTable`, `pageComponents/` |
| **9. API 接口** | `projects/app/src/pages/api/core/ai/model/` 等 50+ API 文件 |

---

## 二、DB Schema 关键变更

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
}
```

**迁移步骤** (`initv4150.ts`):
1. 删除 `model` 字段的 unique 索引（允许多个自定义模型用同一个 OpenAI model 名）
2. 创建新索引 `teamId_1`, `tmbId_1`, `isShared_1`
3. 数据迁移：将 `metadata.xxx` 扁平化到文档顶层，设置 `isShared = true`（存量数据默认共享）

**旧 model 查找（生命周期）**: `schema → metadata → runtime global cache（以 model 名作 key）`
**新 model 查找（生命周期）**: `schema（扁平化，所有字段在顶层）→ runtime global cache（以 _id 作 key）`


### 2. `datasets` 表

| 旧字段 | 新字段 | 值变化 |
|--------|--------|--------|
| `vectorModel: string` | `vectorModelId: string` | 从存储 **模型 model 名** 变为存储 **模型 _id** |
| `agentModel: string` | `agentModelId: string` | 同上 |
| `vlmModel: string` | `vlmModelId: string` | 同上 |

**Mongoose Schema 变化**:
- `default: 'text-embedding-3-small'` → 不再设置 default（改为 required 校验）
- `default: 'gpt-4o-mini'` → 不再设置 default（改为 required 校验）

### 3. 评估相关表

| 表/类型 | 旧字段 | 新字段 |
|----------|--------|--------|
| `EvalDatasetDataQualityMetadata` | `model` | `modelId` |
| `EvalDatasetDataSynthesisMetadata` | `intelligentGenerationModel` | `intelligentGenerationModelId` |
| `EvalDatasetCollectionSchemaType` | `evaluationModel` | `evaluationModelId` |
| `RuntimeConfig` | `llm`, `embedding` | `llmId`, `embeddingId` |
| 评测回调 `SelectedDatasetSchema` | `vectorModel: { model: string }` | `vectorModel: { id: string }` |

---

## 三、工作流/应用配置中关键数据命名变更

### 工作流常量 `NodeInputKeyEnum` (核心枚举)

| 旧 Key 枚举名 | 旧 value → 新 value |
|---------------|---------------------|
| `aiModel` → `aiModelId` | `'model'` → `'modelId'` |
| `datasetSearchEmbeddingModel` → `datasetSearchEmbeddingModelId` | `'embeddingModel'` → `'embeddingModelId'` |
| `datasetSearchRerankModel` → `datasetSearchRerankModelId` | `'rerankModel'` → `'rerankModelId'` |
| `datasetSearchExtensionModel` → `datasetSearchExtensionModelId` | `'datasetSearchExtensionModel'` → `'datasetSearchExtensionModelId'` |
| `generateSqlModel` → `generateSqlModelId` | `'generateSqlModel'` → `'generateSqlModelId'` |
| `datasetDeepSearchModel` → `datasetDeepSearchModelId` | `'datasetDeepSearchModel'` → `'datasetDeepSearchModelId'` |
| `datasetAgenticSearchLLMModel` → `datasetAgenticSearchLLMModelId` | `'agenticSearchLLMModel'` → `'agenticSearchLLMModelId'` |
| `datasetAgenticSearchRerankModel` → `datasetAgenticSearchRerankModelId` | `'agenticSearchRerankModel'` → `'agenticSearchRerankModelId'` |

### 应用配置 `AppSchema`

| 旧字段 | 新字段 |
|--------|--------|
| `AppTTSConfigType.model: string` | `modelId: string` |
| `AppQGConfigType.model: string` | `modelId: string` |
| `AppDatasetSearchParamsType.rerankModel` | `rerankModelId` |
| `AppDatasetSearchParamsType.embeddingModel` | `embeddingModelId` |
| `AppDatasetSearchParamsType.datasetSearchExtensionModel` | `datasetSearchExtensionModelId` |
| `AppDatasetSearchParamsType.generateSqlModel` | `generateSqlModelId` |
| `AppDatasetSearchParamsType.agenticSearchLLMModel` | `agenticSearchLLMModelId` |
| `AppDatasetSearchParamsType.agenticSearchRerankModel` | `agenticSearchRerankModelId` |
| `SettingAIDataType.model` | `modelId` |
| `AppSimpleEditFormType.aiSettings.model` | `modelId` |

### 运行时响应 `DispatchNodeResponseSchema`

| 旧字段 | 新字段 |
|--------|--------|
| `model` | `modelId` |
| `embeddingModel` | `embeddingModelId` |
| `rerankModel` | `rerankModelId` |
| `queryExtensionResult.model` | `queryExtensionResult.modelId` |
| `deepSearchResult.model` | `deepSearchResult.modelId` |
| `extensionModel` | `extensionModelId` (deprecated) |

---

## 四、运行时全局缓存的变更

### Map 类型及变量名

| 旧变量 | 新变量 | Map key 变化 |
|--------|--------|-------------|
| `llmModelMap: Map<string, LLMModelItemType>` | `llmModelIdMap` | key 从 `model` 变为 `id` |
| `embeddingModelMap` | `embeddingModelIdMap` | 同上 |
| `ttsModelMap` | `ttsModelIdMap` | 同上 |
| `sttModelMap` | `sttModelIdMap` | 同上 |
| `reRankModelMap` | `reRankModelIdMap` | 同上 |
| (无) | `systemModelIdMap` | **新增**: 全类型统一查找 |

### 模型查找函数

| 旧函数 | 新函数 | 参数变化 |
|--------|--------|---------|
| `getLLMModel(model?: string)` | `getLLMModelById(id?: string)` | model 名 → model id |
| `getDatasetModel(model?)` | `getDatasetModelById(id?)` | 同上 |
| `getVlmModel(model?)` | `getVlmModelById(id?)` | 同上 |
| `getEmbeddingModel(model?)` | `getEmbeddingModelById(id?)` | 同上 |
| `getTTSModel(model?)` | `getTTSModelById(id?)` | 同上 |
| `getSTTModel(model?)` | `getSTTModelById(id?)` | 同上 |
| `getRerankModel(model?)` | `getRerankModelById(id?)` | 同上 |
| `getEvaluationModel(model?)` | `getEvaluationModelById(id?)` | 同上 |
| `findAIModel(model)` | **删除** | |
| `findModelFromAlldata(model)` | `getModelById(id)` | 功能简化，直接从 `systemModelIdMap` 查 |

### 模型加载流程变更

**旧流程**: `MongoDB(metadata嵌套) → lean() → metadata.model 作为 key → llmModelMap/embeddingModelMap...`

**新流程**:
```
MongoDB(扁平化) → lean() → leanToModelItem() 清洗空值 → _id 作为 id
    ├── llmModelIdMap.set(model.id, model)
    ├── embeddingModelIdMap.set(model.id, model)
    └── systemModelIdMap.set(model.id, model)
```

**额外新增**: 系统模型自动持久化到 MongoDB（通过 bulkWrite upsert），确保插件中的系统模型也有 `_id` 便于统一 ID 查找。

---

## 五、权限系统新增

### 资源类型
- `PerResourceTypeEnum.model` — 模型作为独立的权限管理资源

### 团队权限位
- `TeamPerKeyEnum.modelCreate` = `0b100000000`
- `TeamRoleKeyEnum.modelCreate`

### 新增文件

| 文件 | 作用 |
|------|------|
| `packages/global/support/permission/model/constant.ts` | 定义 Model 角色的 Owner/Read/Write 权限值 |
| `packages/global/support/permission/model/controller.ts` | `ModelPermission` 类，继承 `Permission` 基类 |
| `packages/service/support/permission/model/controller.ts` | 模型权限业务逻辑（协作角色合并、列表过滤） |
| `packages/service/support/permission/model/auth.ts` | 模型级权限鉴权（428 行，新增） |

### 新增 API 端点

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/core/ai/model/create` | POST | 创建自定义模型，写入权限记录 |
| `/api/core/ai/model/list` | POST | 获取有读权限的模型列表（含创建者信息） |
| `/api/core/ai/model/update` | PUT | 更新模型配置 |
| `/api/core/ai/model/delete` | DELETE | 删除自定义模型 |
| `/api/core/ai/model/detail` | POST | 获取单个模型详情 |
| `/api/core/ai/model/updateDefault` | POST | 设置系统默认模型 |
| `/api/core/ai/model/getDefaultConfig` | POST | 获取模型默认配置 |
| `/api/core/ai/model/getConfigJson` | POST | 获取模型配置 JSON |
| `/api/core/ai/model/updateWithJson` | POST | 通过 JSON 更新模型 |
| `/api/admin/initv4150` | POST | v4.15.0 模型重构数据迁移 |

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

## 六、数据流变更示意

### 旧数据流

```
App/Dataset 存储 model 名字 "gpt-4o"
       ↓
getLLMModel("gpt-4o") → llmModelMap.get("gpt-4o")  // 通过 model 名查找
       ↓
返回 LLMModelItemType（包含 maxContext, vision 等配置）
```

### 新数据流

```
App/Dataset 存储 model id "68ad85a7463006c963799a05"
       ↓
getLLMModelById("68ad85a7463006c963799a05") → llmModelIdMap.get("68ad85a7463006c963799a05")
       ↓
返回 LLMModelItemType（id + model + 所有配置字段）
       ↓
实际调用 AI 时取 modelData.model 作为 OpenAI API 的 model 参数
```

---

## 七、影响面汇总

| 影响范围 | 文件数(约) | 核心变化 |
|----------|-----------|---------|
| system_models 表 schema | 2 | metadata 扁平化、新增 permission 字段、model 去唯一索引 |
| datasets 表字段 | 3 | vectorModel/agentModel/vlmModel → XxxModelId |
| 评估相关表字段 | 5 | model → modelId 系列重命名 |
| 工作流 node input keys | 5 | 8 个 model 相关 key 统一加 Id 后缀 |
| 应用配置类型 | 3 | model → modelId |
| 运行时 dispatch 响应 | 1 | model → modelId 系列重命名 |
| 全局 model cache map | 2 | 6 个 Map 重命名，key 从 model 名变 id |
| 模型查找函数 | 2 | 9 个函数重命名，参数从 model 名变 id |
| 权限系统 | 6 | 新增 model 资源类型、团队位、认证中间件 |
| API 接口 | 12 | 新增 CRUD + list 接口，重构权限校验 |
| 前端组件 | 15+ | ModelTable、Channel、表单等适配新 API |
| 数据迁移 | 1 | initv4150.ts 执行 index + data 迁移 |

---

## 八、重构缺陷与未完善项

### 严重 (会导致线上问题)

#### 1. 缺失 `datasets` 表数据迁移脚本

`datasets` 表字段 `vectorModel`/`agentModel`/`vlmModel` 直接重命名为 `vectorModelId`/`agentModelId`/`vlmModelId`，且 **Mongoose Schema 中已彻底删除旧字段**，无 virtual/getter 做向后兼容。

- **旧文档**: `{ vectorModel: "text-embedding-3-small", agentModel: "gpt-4o-mini" }`
- **新 Schema**: 只认 `{ vectorModelId: "...", agentModelId: "..." }`
- **影响**: `dataset.vectorModelId` 读取为 `undefined` → `getEmbeddingModelById(undefined)` → 返回默认模型（**模型配置被静默覆盖为默认值**）
- **涉及代码**:
  - `packages/service/core/dataset/schema.ts` — 旧字段已删除，只保留新字段
  - `projects/app/src/pages/api/core/dataset/detail.ts:39` — 直接读取 `dataset.vectorModelId`
  - `projects/app/src/pages/api/core/dataset/list.ts:377` — 同上
- **修复建议**: 在 `initv4150.ts` 中增加 dataset 迁移步骤，通过旧 `model` 名在 `system_models` 中查找对应 `_id`，回填 `vectorModelId`/`agentModelId`/`vlmModelId`

#### 2. 缺失应用工作流模块 (App Modules) 的数据迁移

工作流节点 inputs 的 key 值已从 `'model'` 改为 `'modelId'`（对应 `NodeInputKeyEnum.aiModelId`），但 **存量 App 文档中的 `modules[].inputs[]` 仍存储旧 key**。

- **旧数据**: `{ key: 'model', value: 'gpt-4o' }`
- **新代码**: 通过 `NodeInputKeyEnum.aiModelId` (= `'modelId'`) 查找 inputs → **匹配不上，节点模型为空**
- **影响面**: 所有存量工作流中的 AI Chat、Dataset Search、Agent 等节点的模型选择全部失效
- **涉及代码**:
  - `packages/global/core/workflow/constants.ts` — 8 个枚举值重命名
  - `packages/service/core/workflow/dispatch/ai/chat.ts:110` — 通过 `inputs[NodeInputKeyEnum.aiModelId]` 查找，读不到旧 key
  - `packages/global/core/workflow/utils.ts:505` — `extractWorkflowModelIds` 的 `workflowModelInputKeySet` 只包含新 key
- **需要迁移的 key 映射**:
  ```
  'model'                       → 'modelId'
  'embeddingModel'              → 'embeddingModelId'
  'rerankModel'                 → 'rerankModelId'
  'datasetSearchExtensionModel' → 'datasetSearchExtensionModelId'
  'generateSqlModel'            → 'generateSqlModelId'
  'datasetDeepSearchModel'      → 'datasetDeepSearchModelId'
  'agenticSearchLLMModel'       → 'agenticSearchLLMModelId'
  'agenticSearchRerankModel'    → 'agenticSearchRerankModelId'
  ```
- **更为棘手的是**: 旧 value 是 model 名字（如 `'gpt-4o'`），新代码期望 model id（如 `'68ad85a7463006c963799a05'`），需要同时做 value 的映射转换
- **修复建议**: 在 `initv4150.ts` 中增加 App modules 迁移步骤，遍历所有 App 的 `modules[].inputs[]`，替换 key 并将 value 从 model 名转换为 model id。对于 `datasetParams` 复合对象内嵌的 model 字段也需同样处理

### 中等 (功能降级)

#### 3. 缺失 App chatConfig 数据迁移

App 的 `chatConfig.questionGuide.model` → `modelId`、`chatConfig.ttsConfig.model` → `modelId` 无迁移脚本。

- **影响**: 存量 App 的问答引导和 TTS 功能可能使用错误的模型选择
- **涉及代码**: `packages/global/core/app/type.ts` 中 `AppQGConfigTypeSchema`、`AppTTSConfigTypeSchema`

#### 4. 缺失评估 (Evaluation) 数据迁移

以下字段变更无迁移脚本:
- `EvalDatasetDataQualityMetadata.model` → `modelId`
- `EvalDatasetDataSynthesisMetadata.intelligentGenerationModel` → `intelligentGenerationModelId`
- `EvalDatasetCollectionSchemaType.evaluationModel` → `evaluationModelId`
- `RuntimeConfig.llm`/`embedding` → `llmId`/`embeddingId`

- **影响**: 存量评估任务可能无法正常运行
- **涉及代码**: `packages/global/core/evaluation/`、`packages/service/core/evaluation/`

#### 5. DatasetTraining Schema 中 `model` 字段废弃未清理

`DatasetTrainingSchema` 已移除 `model` 字段（`packages/global/core/dataset/type.ts`），`updateTraining` 函数也移除了旧的 `model: agentModel` 写入（`projects/app/src/pages/api/core/dataset/update.ts:339` 附近），但存量训练记录中仍保留孤儿字段。虽不影响功能，但数据不一致。

### 轻微 (边界情况)

#### 6. 模型查找函数缺少防御性兜底

`packages/service/core/ai/model.ts` 中所有 `getXxxById` 函数使用非空断言 `!`，但 `Map.get()` 在 key 不存在时返回 `undefined`：

```typescript
// 当模型被删除后 id miss, 返回 undefined 却声称类型是 LLMModelItemType
export const getLLMModelById = (id?: string): LLMModelItemType => {
  if (!id) return getDefaultLLMModel();
  return global.llmModelIdMap?.get(id)!;
};
```

- **影响**: 后续 `.model` 访问 TypeError
- **修复建议**: 改为 `?? getDefaultLLMModel()` 或显式抛错

#### 7. `getVlmModelById` 对非 vision 模型返回 undefined

```typescript
export const getVlmModelById = (id?: string): LLMModelItemType => {
  if (!id) return getDefaultVLMModel();
  const model = global.llmModelIdMap?.get(id);
  return (model?.vision ? model : undefined)!;
};
```

传入 LLM 模型 id（非 vision）时，该函数返回 `undefined` 而**类型声明声称返回 `LLMModelItemType`**，属于类型欺骗。

### 建议优先级

| 优先级 | 缺陷 | 说明 |
|--------|------|------|
| **P0** | #1 datasets 迁移 | 存量数据集模型配置全部丢失 |
| **P0** | #2 App modules 迁移 | 存量工作流模型节点全部失效 |
| **P1** | #3 chatConfig 迁移 | 问答引导、TTS 功能降级 |
| **P1** | #6 查找函数兜底 | 运行时 TypeError |
| **P2** | #4 评估数据迁移 | 历史评估任务不可用 |
| **P2** | #5 训练记录清理 | 数据一致性问题 |
| **P3** | #7 VLM 函数修复 | 类型安全 + 边界行为 |
