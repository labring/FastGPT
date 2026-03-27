# Rerank 训练架构重构：新增 P-tuning 支持

## 1. 背景与目标

### 1.1 当前架构（LoRA）

当前 SFT Bridge 使用 **LoRA** 微调技术。每次训练产出一个完全独立的新模型端点（独立的 `model`、`base_url`、`api_key`），模型之间没有层级限制，可以无限嵌套：

```
A (base, endpoint: { model: "bge-reranker-v2-m3", base_url: "...", api_key: "..." })
├── task1 → A1 (endpoint: { model: "A1-LoRA-xxx", base_url: "...", api_key: "..." })
│   └── task11 → A11 (endpoint: { model: "A11-LoRA-xxx", base_url: "...", api_key: "..." })
│       └── task111 → A111 (...)
└── task2 → A2 (endpoint: { model: "A2-LoRA-xxx", base_url: "...", api_key: "..." })
    └── task21 → A21 (...)
```

**LoRA 训练特点**：
- 每次微调基于传入模型的权重做增量调整，产出新的独立模型服务
- 产出模型有独立的推理端点，与基座模型完全解耦
- 可以无限级联（A→A1→A11→...），每一层都是完整的模型

### 1.2 重构目标：新增 P-tuning 支持

SFT Bridge **新增** P-tuning 微调方式支持（LoRA 继续保留）。

**关键设计决策：SFT Bridge 屏蔽实现细节**。不论 LoRA 还是 P-tuning，SFT Bridge 统一返回新的 endpoint（`{ base_url, model, api_key }`）。FastGPT 不感知 encoder/base_model_id 等 P-tuning 内部概念，始终按「新模型端点」处理。

**P-tuning 与 LoRA 对比（SFT Bridge 内部视角）**：

| 维度 | LoRA | P-tuning |
|------|------|----------|
| 微调产物 | 完整独立模型端点 | 提示编码器（encoder）配置 |
| 基模状态 | 每个模型独立部署 | 基模常驻运行，encoder 按需加载 |
| 模型层级 | 无限级联 | 固定两层（基模 → 微调模型） |
| 再训练语义 | A1→A11（新模型） | A1→A1'（更新 encoder，同一基模） |

**FastGPT 视角**：两者行为完全一致 — 训练产出新 endpoint，注册为新模型。

### 1.3 目标总结

1. **LoRA 和 P-tuning 并存**：SFT Bridge 新增 P-tuning 支持，FastGPT 通过 `trainType` 参数区分
2. **SFT Bridge 统一接口**：不论训练方式，统一返回新 endpoint，FastGPT 无感知差异
3. **apply 阶段自动替换**：新模型更优时，自动替换 App 中旧模型引用，禁用旧模型
4. **任务删除清理制品**：删除任务时统一清理该任务产出的所有制品（model config + channel + SFT Bridge 资源 + 评估/训练数据）

---

## 2. 核心设计

### 2.1 训练类型（trainType）

在任务创建时指定训练类型，贯穿整个任务生命周期：

```typescript
// 新增枚举（packages/global/core/train/rerank/constants.ts）
export enum RerankTrainTypeEnum {
  lora = 'lora',
  ptuning = 'ptuning'
}
```

`trainType` 仅用于：
- 传递给 SFT Bridge（告知使用哪种微调方式）
- UI 展示
- 任务记录

FastGPT 的 register/apply/delete 逻辑**不按 trainType 分叉**，行为统一。

### 2.2 统一流程

不论 LoRA 还是 P-tuning，FastGPT 侧的处理流程完全一致：

```
创建任务（传 trainType）
  → generate_trainset → generate_evaldataset → eval_basemodel
  → finetuning（SFT Bridge 内部按 trainType 走不同策略）
  → registering（统一：用返回的 endpoint 创建新模型配置）
  → eval_tunedmodel
  → applying（统一：比较评估结果，自动替换 App 引用或禁用表现较差的模型）
```

### 2.3 资源生命周期

| 事件 | 行为 |
|------|------|
| apply: 新模型更好 | 替换 App 引用（旧→新），禁用旧模型（若 isTuned） |
| apply: 新模型更差 | 禁用表现较差的新模型 |
| 任务删除 | 清理该任务产出的所有制品（见第 6 节） |

**职责分离**：
- **apply 阶段**：决策 + App 引用管理 + 模型启用/禁用（不删除任何制品）
- **任务删除**：统一清理该任务产出的所有制品（model config + channel + SFT Bridge 资源 + 评估数据集 + 训练集 + 临时文件）

---

## 3. SFT Bridge 接口变更

### 3.1 训练接口（新增 trainType 参数）

```
POST /api/v1/optimization/tasks
  input:  { datasetFile, taskType, parameters, trainType }  ← 新增 trainType
  output: { task_id, status, message }

GET /api/v1/optimization/tasks/{task_id}
  output: { task_id, status, progress, message, endpoint? }
```

**trainType 参数**：`'lora' | 'ptuning'`，告知 SFT Bridge 使用哪种微调方式。

**endpoint 结构（统一，不区分 trainType）**：

```typescript
endpoint?: {
  base_url: string;
  model: string;
  api_key: string;
}
```

P-tuning 内部的 encoder routing 由 SFT Bridge 自行管理，不暴露给 FastGPT。

### 3.2 删除接口（统一）

```
DELETE /api/v1/optimization/tasks/{task_id}
  → 清理该训练任务产生的所有资源
  → LoRA：删除微调后的模型部署
  → P-tuning：删除 encoder 配置，释放基模侧资源
  → 统一接口，FastGPT 无需区分
```

已有接口，要求 SFT Bridge 扩展以同时支持 LoRA 和 P-tuning 资源清理。

### 3.3 Mock 实现变更

```typescript
// mock.ts — 不变，endpoint 结构与 LoRA 一致
if (currentStatus === SFTTaskStatus.completed) {
  const baseUrl = process.env.MOCK_SFT_ENDPOINT_BASE_URL;
  const model = process.env.MOCK_SFT_ENDPOINT_MODEL;
  const apiKey = process.env.MOCK_SFT_ENDPOINT_API_KEY;

  if (baseUrl && model && apiKey) {
    response.endpoint = { base_url: baseUrl, model, api_key: apiKey };
  }
}
```

Mock 无需特殊处理 P-tuning — endpoint 结构一致。

---

## 4. FastGPT 数据模型变更

### 4.1 训练任务 Schema 变更

```typescript
// RerankTrainTaskSchemaType 新增顶层字段
type RerankTrainTaskSchemaType = {
  // ... 保留所有现有字段 ...
  trainType: `${RerankTrainTypeEnum}`;  // 新增，required，默认 'lora'
};
```

checkpoint **不变** — endpoint 结构与 LoRA 一致，无需扩展。

result 新增 `newModelIsBetter: boolean` 和 `updatedAppCount?: number`（记录 apply 操作结果）。

### 4.2 SFT Bridge 类型变更

```typescript
// packages/service/core/train/rerank/external/sftbridge/types.ts

// CreateSFTTaskRequest 新增 trainType
export type CreateSFTTaskRequest = {
  datasetFile: Buffer | ReadStream;
  taskType: 'rerank' | 'embed';
  trainType?: 'lora' | 'ptuning';  // 新增
  parameters?: { ... };
};

// endpoint 结构不变
endpoint?: {
  base_url: string;
  model: string;
  api_key: string;
};
```

### 4.3 API 接口类型变更

```typescript
// CreateRerankTrainTaskRequest 新增 trainType
export type CreateRerankTrainTaskRequest = {
  // ... 保留所有现有字段 ...
  trainType?: `${RerankTrainTypeEnum}`;  // 新增，默认 'lora'
};
```

---

## 5. 阶段逻辑变更

### 5.1 设计原则

**不按 trainType 分叉**。LoRA 和 P-tuning 的 FastGPT 侧处理逻辑完全一致，因为 SFT Bridge 统一了 endpoint 格式。

唯一的 trainType 传递点是 finetune 阶段调用 `createSFTTask` 时。

### 5.2 finetune.ts — 传递 trainType

```typescript
export async function runFinetuneStage(task: RerankTrainTaskSchemaType) {
  // 现有逻辑不变，仅在 createSFTTask 时新增 trainType 参数
  const createResponse = await createSFTTask({
    datasetFile,
    taskType: 'rerank',
    trainType: task.trainType || 'lora',  // ← 新增
    parameters: { ... }
  });
  // ... 轮询逻辑不变 ...
  // 返回 endpoint（统一结构，不区分 trainType）
}
```

### 5.3 register.ts — 无变更

现有逻辑完全适用：从 finetuning checkpoint 取 endpoint，创建 model config + channel。LoRA 和 P-tuning 的 endpoint 结构一致，不需要分叉。

### 5.4 apply.ts — 自动替换 App 引用

```typescript
export async function runApplyingStage(task: RerankTrainTaskSchemaType): Promise<void> {
  const tunedModelId = task.checkpoint.data?.registering?.tunedModelId;

  const newModelIsBetter = compareEvalPerformance(
    task.checkpoint.data?.eval_basemodel?.baseModelEvalResult,
    task.checkpoint.data?.eval_tunedmodel?.tunedModelEvalResult
  );

  if (newModelIsBetter) {
    // ── 新模型更好：替换 App 引用 + 禁用旧模型（若旧模型是 isTuned） ──
    await replaceModelInApps(task.baseModelId, tunedModelId);
    if (isTunedModel(task.baseModelId)) {
      await disableModel(task.baseModelId);
    }
  } else {
    // ── 新模型更差：禁用新模型（制品清理由任务删除统一处理） ──
    await disableModel(tunedModelId);
  }
}
```

**replaceModelInApps 函数**（基于现有 `apply-to-apps.ts` 逻辑整合）：

```typescript
async function replaceModelInApps(
  oldModelId: string,
  newModelId: string
): Promise<{ updatedCount: number }> {
  // 查找所有引用旧模型的 App
  const apps = await MongoApp.find({
    'modules.inputs': {
      $elemMatch: {
        key: NodeInputKeyEnum.datasetSearchRerankModel,
        value: oldModelId
      }
    }
  }).lean();

  let updatedCount = 0;

  for (const app of apps) {
    // 替换节点中的模型引用
    const updatedModules = app.modules.map((node) => {
      if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return node;
      return {
        ...node,
        inputs: node.inputs.map((input) => {
          if (input.key === NodeInputKeyEnum.datasetSearchRerankModel && input.value === oldModelId) {
            return { ...input, value: newModelId };
          }
          return input;
        })
      };
    });

    // 更新 App 并创建版本
    await MongoApp.updateOne({ _id: app._id }, { $set: { modules: updatedModules } });
    await saveAppVersion({
      appId: app._id,
      nodes: updatedModules,
      edges: app.edges,
      chatConfig: app.chatConfig,
      versionName: `Auto-apply rerank model: ${newModelId}`,
      isPublish: true
    });
    updatedCount++;
  }

  return { updatedCount };
}
```

**disableModel 函数**：

```typescript
async function disableModel(modelId: string): Promise<void> {
  await MongoSystemModel.updateOne(
    { model: modelId },
    { $set: { 'metadata.isActive': false } }
  );
  await updatedReloadSystemModel();
}
```

> **待优化**：当前 `disableModel` 仅禁用 FastGPT 侧的模型配置。SFT Bridge 侧对应的推理实例仍在运行、占用显卡资源。后续需 SFT Bridge 提供「禁用/卸载推理实例」接口，FastGPT 在 `disableModel` 时同步调用，释放 GPU 资源。对于 LoRA 模型即卸载独立部署的模型服务，对于 P-tuning 模型即卸载对应 encoder（基模常驻不受影响）。

### 5.5 processor.ts — 最小变更

```typescript
// result 中记录 apply 的实际操作结果
result: {
  // ... 现有字段 ...
  newModelIsBetter: boolean;   // 新模型是否更优
  updatedAppCount?: number;    // 替换了多少个 App 的模型引用（仅更优时有值）
}
```

---

## 6. 任务删除

### 6.1 统一清理该任务产出的所有制品

```typescript
async function deleteRerankTrainTask(taskId: string, session?: ClientSession) {
  const task = await MongoRerankTrainTask.findById(taskId).lean();

  // 1. 清理 FastGPT 模型配置 + channel（registering 阶段产物）
  const tunedModelId = task.checkpoint?.data?.registering?.tunedModelId;
  if (tunedModelId) {
    try {
      await deleteRerankModelConfig(tunedModelId);
    } catch (error) {
      addLog.warn('Failed to delete tuned model config, continuing', { tunedModelId, error });
    }
  }

  // 2. 清理 SFT Bridge 资源（finetuning 阶段产物，异步非阻塞）
  const sftTaskId = task.checkpoint?.data?.finetuning?.sftTaskId;
  if (sftTaskId) {
    setImmediate(() => {
      deleteSFTTask({ taskId: sftTaskId }).catch((err) => {
        addLog.warn('Failed to delete SFT task', { sftTaskId, error: String(err) });
      });
    });
  }

  // 3. 清理评估数据集（generate_evaldataset 阶段产物，现有逻辑不变）
  const evalCollections = await MongoEvalDatasetCollection.find(
    { 'metadata.taskId': taskId }, null, { session }
  ).lean();
  if (evalCollections.length > 0) {
    const collectionIds = evalCollections.map((col) => col._id);
    await MongoEvalDatasetData.deleteMany({ evalDatasetCollectionId: { $in: collectionIds } }, { session });
    await MongoEvalDatasetCollection.deleteMany({ _id: { $in: collectionIds } }, { session });
  }

  // 4. 清理自动创建的训练集（generate_trainset 阶段产物，仅自动模式）
  // 若 trainsetId 是本任务自动创建的（非用户传入），关联删除 trainset + trainset data
  // 判断依据：task.datasetIds 有值（自动模式）且 trainsetId 由本阶段回写
  if (task.datasetIds?.length && task.trainsetId) {
    await MongoRerankTrainsetData.deleteMany({ trainsetId: task.trainsetId }, { session });
    await MongoRerankTrainset.deleteOne({ _id: task.trainsetId }, { session });
  }

  // 5. 删除任务记录
  await MongoRerankTrainTask.deleteOne({ _id: taskId }, { session });

  // 6. 清理临时文件（异步非阻塞）
  const tempFilePath = task.result?.trainDatasetFilePath;
  if (tempFilePath) {
    setImmediate(() => {
      cleanupTempFiles(tempFilePath).catch((error) => {
        addLog.warn('Failed to cleanup temp files', { taskId, tempFilePath, error });
      });
    });
  }
}
```

**制品清理清单**：

| 制品 | 来源阶段 | 清理方式 | 备注 |
|------|---------|---------|------|
| FastGPT 模型配置 + channel | registering | `deleteRerankModelConfig(tunedModelId)` | 幂等：模型可能已被其他任务的 apply 禁用但仍存在 |
| SFT Bridge 资源（LoRA 模型部署 / P-tuning encoder） | finetuning | `deleteSFTTask({ taskId: sftTaskId })` | 异步非阻塞，SFT Bridge 统一处理 |
| 评估数据集（collection + data） | generate_evaldataset | 现有逻辑 | 仅自动模式创建的 |
| 训练集 + 训练数据 | generate_trainset | 关联删除 trainset + data | 仅自动模式创建的（`datasetIds` 有值） |
| 临时 JSONL 文件 | generate_trainset | `cleanupTempFiles` | 异步非阻塞 |

### 6.2 风险：删除活跃模型的任务

如果用户删除了当前活跃模型对应的训练任务，model config + channel + SFT Bridge 部署都会被清理，导致该模型推理失败。

**缓解措施**（可选，按需实现）：
- 删除前检查：查询是否有 App 引用该任务产出的模型，返回引用计数
- 前端二次确认弹窗：「该任务的模型正在被 N 个 App 使用，删除后将影响推理」

---

## 7. 场景验证

### 7.1 首次训练（基模 → 新模型，更好）

```
基模 A（非 isTuned）
Task1: A → 训练 → M1 → apply: M1 更好
  → replaceModelInApps(A, M1)：查找使用 A 的 App 并替换为 M1
  → A 非 isTuned，不禁用
  → M1 启用 ✅
```

### 7.2 连续训练（微调模型 → 新模型，更好）

```
App1, App2 使用 M1
Task2: M1 → 训练 → M2 → apply: M2 更好
  → App1, App2 中 M1 引用自动切换为 M2
  → M1 禁用
  → M2 启用 ✅

删除 Task1 → 清理 M1 全部制品（model config + channel + SFT Bridge 资源，M1 已禁用）✅
删除 Task2 → 清理 M2 全部制品 ⚠️（M2 正在使用，需用户确认）
```

### 7.3 连续训练（新模型更差）

```
App1, App2 使用 M1
Task2: M1 → 训练 → M2 → apply: M2 更差
  → M2 禁用（model config 保留，不删除）
  → M1 不受影响，App1, App2 继续使用 M1 ✅

删除 Task2 → 清理 M2 model config + channel + SFT Bridge 资源 ✅
```

### 7.4 多级连续训练

```
Task1: A → M1 → apply: 更好 → replaceModelInApps(A, M1), A 非 isTuned 不禁用
Task2: M1 → M2 → apply: 更好 → replaceModelInApps(M1, M2), M1 禁用
Task3: M2 → M3 → apply: 更好 → replaceModelInApps(M2, M3), M2 禁用
Task4: M3 → M4 → apply: 更差 → M4 禁用

最终状态：A(启用), M1(禁用), M2(禁用), M3(启用), M4(禁用)
App 使用 M3 ✅

删除 Task1 → 清理 M1 全部制品 ✅（M1 已禁用）
删除 Task2 → 清理 M2 全部制品 ✅（M2 已禁用）
删除 Task3 → 清理 M3 全部制品 ⚠️（M3 活跃，需用户确认）
删除 Task4 → 清理 M4 全部制品 ✅（M4 已禁用）
```

### 7.5 P-tuning 场景（FastGPT 视角与 LoRA 完全一致）

```
Task1: A → 训练(trainType=ptuning) → M1(endpoint 由 SFT Bridge 返回) → apply: 更好
  → replaceModelInApps(A, M1), A 非 isTuned 不禁用
  → M1 启用 ✅

Task2: M1 → 训练(trainType=ptuning) → M2 → apply: 更好
  → replaceModelInApps(M1, M2), M1 禁用
  → SFT Bridge 内部：M2 对应同一基模的新 encoder
  → FastGPT 不感知 encoder 细节 ✅

删除 Task1 → 清理 M1 全部制品（SFT Bridge 内部清理对应 encoder）✅
删除 Task2 → 清理 M2 全部制品 ⚠️（M2 活跃，需用户确认）
```

---

## 8. 完整变更清单

### 8.1 SFT Bridge 侧（需协调）

| 变更 | 描述 |
|------|------|
| 训练接口新增 `trainType` 参数 | `POST /api/v1/optimization/tasks` body 新增 `trainType: 'lora' \| 'ptuning'` |
| P-tuning 训练实现 | SFT Bridge 内部按 trainType 走不同微调策略，但 endpoint 返回格式统一 |
| 删除接口扩展 | `DELETE /api/v1/optimization/tasks/{task_id}` 需同时支持 LoRA 和 P-tuning 资源清理 |
| 禁用/卸载推理实例（待优化） | 提供接口支持卸载指定模型的推理实例以释放 GPU 资源（LoRA：卸载独立模型服务；P-tuning：卸载 encoder） |

### 8.2 FastGPT 全局类型层

| 文件 | 变更 |
|------|------|
| `global/core/train/rerank/constants.ts` | 新增 `RerankTrainTypeEnum { lora, ptuning }` |
| `global/core/train/rerank/type.d.ts` | 任务新增 `trainType` 顶层字段；result 新增 `newModelIsBetter`、`updatedAppCount?` |
| `global/core/train/rerank/api.d.ts` | `CreateRerankTrainTaskRequest` 新增 `trainType?` |

### 8.3 FastGPT Service 层

| 文件 | 变更 |
|------|------|
| `external/sftbridge/types.ts` | `CreateSFTTaskRequest` 新增 `trainType?` |
| `external/sftbridge/client.ts` | `createSFTTask` 传递 trainType |
| `task/stages/finetune.ts` | `createSFTTask` 调用时传递 `trainType` 参数 |
| `task/stages/apply.ts` | **重写**：新增 `replaceModelInApps` + `disableModel`；不再删除任何制品，只做决策 + 启用/禁用 |
| `task/controller.ts` | `deleteRerankTrainTask` **重写**：统一清理所有制品（model config + channel + SFT Bridge + 评估数据集 + 训练集 + 临时文件） |
| `task/processor.ts` | result 写入 `newModelIsBetter` + `updatedAppCount` |
| `task/schema.ts` | 新增 `trainType` 字段 |

### 8.4 FastGPT API 层

| 文件 | 变更 |
|------|------|
| `task/create.ts` | 接收并透传 `trainType` 参数 |
| `task/apply-to-apps.ts` | **可移除或保留为手动触发入口**（apply 阶段已自动执行） |

### 8.5 无需变更

| 组件 | 原因 |
|------|------|
| `RerankModelItemType` 类型定义 | SFT Bridge 屏蔽了 encoder 细节，FastGPT 不感知 |
| `reRankRecall` 推理层 | 不需要传递 `base_model_id`/`encoder_id`，SFT Bridge 内部路由 |
| aiproxy | 不涉及 |
| `MongoSystemModel` schema | 不变 |
| `register.ts` | endpoint 结构一致，现有逻辑完全适用 |
| `generate_trainset` / `generate_evaldataset` / `eval_basemodel` / `eval_tunedmodel` | 不受影响 |
| `mock.ts` | endpoint 结构不变 |

---

## 9. 与现有重构的关系

本文档是 `rerank-training-platform-refactor.md` 的**增量补充**。

| 维度 | 原设计文档 | 本文档 |
|------|-----------|--------|
| 核心主题 | 解耦 App，迁移到模型管理平台 | 新增 P-tuning 支持 |
| LoRA 支持 | 完整保留 | 继续保留，行为不变 |
| 阶段流转 | 7 阶段 | 不变 |
| Schema | 移除 appId 等 | 新增 trainType 字段 |
| apply.ts | 比较评估结果，保留最优（含连续训练旧模型清理） | **重写**：只做决策 + App 引用替换 + 模型启用/禁用，不删除任何制品 |
| apply-to-apps | 独立 API，手动触发 | **整合进 apply 阶段自动执行** |
| 任务删除 | 级联清理模型配置 + SFT Bridge | **重写**：统一清理所有制品（model config + channel + SFT Bridge + 评估/训练数据） |
| trainType 分叉 | 无 | finetune 传递参数，其余阶段无分叉 |

**实施顺序**：

1. 先完成 App 解耦重构（已大部分完成）
2. 再叠加本文档的 P-tuning 扩展
3. SFT Bridge P-tuning 能力开发并行推进

---

## 10. 关键前提与风险

| 项目 | 说明 |
|------|------|
| **SFT Bridge 统一 endpoint** | 整个方案的前提。P-tuning 训练必须返回与 LoRA 格式一致的 `{ base_url, model, api_key }` endpoint |
| **SFT Bridge 统一删除** | `DELETE /api/v1/optimization/tasks/{task_id}` 需同时支持 LoRA 和 P-tuning 资源清理 |
| **SFT Bridge 禁用推理实例（待优化）** | 当前 `disableModel` 仅禁用 FastGPT 侧配置，SFT Bridge 侧推理实例仍占用 GPU。后续需提供卸载接口释放资源 |
| **SFT Bridge 内部路由** | P-tuning 模型的 `(base_model_id, encoder_id)` 路由由 SFT Bridge 内部管理，FastGPT 只按 `model` 名称路由 |
| **eval 阶段兼容** | DiTing 评估调用 SFT Bridge 时只传 `model` 名称，SFT Bridge 须支持 model name → P-tuning encoder 的映射 |
| **向后兼容** | `trainType` 为 optional，默认 `'lora'`。现有 LoRA 任务的 `trainType` 字段缺失视为 `'lora'` |
| **数据迁移** | 无需迁移 |
| **活跃模型删除风险** | 任务删除一律清理所有制品（含 model config + SFT Bridge 部署），若对应模型仍被 App 使用则推理断裂。建议前端增加二次确认 |
