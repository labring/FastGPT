# Rerank 训练平台重构设计文档

## 1. 背景与目标

### 1.1 现状

当前 rerank 训练任务入口绑定在 App 上（通过 `appId`），与 App 工作流深度耦合：
- 任务创建需要传入 `appId`
- 基座模型信息（`baseModelConfigId`、`baseModelEndpoint`）在创建时从 App 的 workflow 节点中提取并固化到任务记录上
- 知识库列表（评估数据来源）从 App 的 workflow 节点中提取
- Apply 阶段直接修改单个 App 的 workflow 节点

### 1.2 重构目标

将训练任务从 App 解耦，入口改为从**可用模型**处发起，实现**模型管理平台**：

1. 创建入口：从可用模型列表发起训练，直接指定基座模型 + 知识库列表
2. 阶段调整：将 evaluating 拆分为 3 个独立阶段，并**移至 finetuning 之前**建立 baseline
3. 注册阶段：创建新模型配置 + channel
4. 应用阶段：训练任务本身只负责模型质量决策与旧模型清理；将训练成果应用到 App 由独立接口负责
5. 删除逻辑：确保同一基座模型下全局只有一个最优 fine-tuned model

---

## 2. 现有设计分析

### 2.1 当前阶段流转

```
preparing → finetuning → registering → evaluating → applying
```

当前 evaluating 阶段在 registering 之后，是一个单整体步骤，内部包含：
- 生成评估数据集
- 评估基础模型
- 评估微调模型

### 2.2 当前数据模型关键字段

```typescript
// 训练任务
{
  appId: ObjectId,           // 绑定 App（强耦合）
  trainsetId: ObjectId,      // 绑定训练集
  baseModelConfigId: string, // 从 App 提取的基座模型 ID
  baseModelEndpoint: {...},  // 从 App 提取的基座模型端点
}

// 创建请求
{
  appId: string,             // 必须传入 appId
  trainsetId: string,        // 或自动创建
}
```

### 2.3 当前问题

| 问题 | 描述 |
|------|------|
| 强耦合（任务） | 基座模型、知识库都从 App 节点提取，无法独立使用 |
| 强耦合（trainset schema） | `rerank_trainset` schema 中 `appId` 是 required，且有 `{ appId: 1, createTime: -1 }` 索引，trainset 无法独立于 App 存在 |
| 强耦合（trainset data schema） | `rerank_trainset_data` schema 中 `appId` 也是 required，且有 2 个 appId 复合索引（`{ appId, createTime }` 和 `{ appId, source }`），每条训练数据都冗余存储 appId |
| 强耦合（trainset controller） | `trainset/controller.ts:createRerankTrainset` 接收 `appId` 参数，内部调用 `MongoApp.findById(appId)` 校验 App 存在后才创建 trainset |
| 强耦合（data controller） | `data/controller.ts:createManualTrainData` 接收 `appId` 参数并写入每条手动训练数据 |
| 强耦合（data 生成 worker） | `data/processor.ts` 从 job data 的 `appId`（required）调用 `MongoApp.findById(appId)` 校验 App 存在，再用 `extractDatasetIdsFromApp(app)` 作为 fallback 获取 datasetIds |
| 强耦合（data/mq.ts） | `RerankTrainDataGenerateJobData` 的 `appId` 是 required 字段，所有 BullMQ 数据生成 job 必须携带 appId |
| 强耦合（trainset API 路由） | `trainset/create.ts` 用 `authApp(appId)` 鉴权；`trainset/data/generate.ts` 和 `trainset/data/create.ts` 从 `trainset.appId` 派生 appId 用于鉴权和队列 payload；`trainset/delete.ts` 用 `trainset.appId` 查询关联的运行中任务 |
| 阶段顺序不合理 | evaluating 在 registering 之后，baseline 建立太晚 |
| Apply 局限 | 只更新单个 App 的工作流，且训练任务与 App 替换强绑定，无法按需选择替换目标 |
| 删除逻辑缺陷 | 连续微调时，劣质的新微调模型不会被删除 |

---

## 3. 重构后设计

### 3.1 新阶段流转

```
generate_trainset → generate_evaldataset → eval_basemodel → finetuning → registering → eval_tunedmodel → applying
```

> 原 `preparing` 阶段重命名为 `generate_trainset`，以与 `generate_evaldataset` 对称，统一"生成资源"的命名语义。

**阶段说明**：

| 阶段 | 说明 |
|------|------|
| generate_trainset | `task.trainsetId` 非空→ 直接等待 trainset ready；为空（自动模式）→ 先创建 trainset 并触发训练数据生成，再等待 ready。就绪后生成 JSONL 文件 |
| generate_evaldataset | `task.evalDatasetId` 非空→ 直接写入 checkpoint（已就绪）；为空（自动模式）→ 从 `task.datasetIds` 采样调用 DiTing 生成评估集，完成后回写 `task.evalDatasetId` |
| eval_basemodel | 用 `task.baseModelId` 对应的模型在评估集上评估，建立 baseline |
| finetuning | 调用 SFT Bridge 微调 |
| registering | 注册微调模型：创建新模型配置 + channel |
| eval_tunedmodel | 用 tunedModelId 在评估集上评估，与 baseline 对比 |
| applying | 核心决策阶段：评估结果决定保留/替换/回滚，整合了原 handlePreviousModelDeletion 逻辑 |

**设计意图**：
- `generate_trainset` 与 `generate_evaldataset` **完全对称**，统一处理模式：
  - 顶层字段为空（自动模式）→ 阶段内负责生成并回写
  - 顶层字段非空（精确模式）→ 阶段内跳过生成（直接确认就绪或写 checkpoint）
- `generate_evaldataset` + `eval_basemodel` 移至 **finetuning 之前**：
  - 在微调前建立 baseline，符合标准 ML 实验流程（先建立对照组，再变化）
  - **fail-fast**：若 DiTing 服务不可用，在浪费 SFT Bridge 资源前就发现问题
- `eval_tunedmodel` 在 `registering` 后执行，确保微调模型已注册并可用
- `applying` 整合决策与执行，不再有独立的后处理步骤

### 3.2 新 Schema 设计

#### 3.2.1 训练任务 Schema 变更

```typescript
// 移除
- appId: ObjectId                  // 解耦 App

// 新增
+ trainsetId?: string              // 训练集 ID（精确模式：create 时传入；自动模式：由 generate_trainset 阶段生成后回写）
+ evalDatasetId?: string           // 评估数据集 ID（精确模式：create 时传入；自动模式：由 generate_evaldataset 阶段生成后回写）
+ datasetIds?: string[]            // 知识库 ID 列表（仅自动模式使用，generate_trainset/generate_evaldataset 阶段的数据来源）
+ baseModelId: string              // 基座模型 ID（对应 BaseModelItemType.model）
+ newModelName?: string            // 训练后的模型名称（可选）

// 保留（重命名）
~ baseModelConfigId → baseModelId  // 语义更清晰，去掉 Config 后缀
~ trainsetId 从 required → optional（自动模式创建时为空，由 generate_trainset 阶段回写）

// checkpoint.data 新结构（阶段重命名 + 顺序变化 + 拆分 evaluating）
checkpoint: {
  stage: RerankTaskCheckpointStageEnum | null,
  data: {
    generate_trainset?: { trainDatasetId, trainDatasetFilePath }  // 原 preparing
    generate_evaldataset?: { evalDatasetId }
    eval_basemodel?: { baseModelEvalResult }
    finetuning?: { sftTaskId, tunedModelEndpoint }
    registering?: { tunedModelId }                  // 注册新模型，tunedModelId 始终是新 ID
    eval_tunedmodel?: { tunedModelEvalResult }
    applying?: {
      newModelKept: boolean,               // 新模型是否被保留（优于 baseModel 时为 true）
    }
  },
  stageEndTime: {
    generate_trainset: Date,      // 原 preparing 重命名
    generate_evaldataset: Date,   // 新增
    eval_basemodel: Date,         // 新增
    finetuning: Date,
    registering: Date,
    eval_tunedmodel: Date,        // 新增
    applying: Date
    // 移除：preparing（重命名为 generate_trainset）、evaluating（拆分为上面三个）
  }
}
```

#### 3.2.2 Trainset / Trainset Data Schema 变更（解耦 App）

```typescript
// ── rerank_trainset Schema ──────────────────────────────────
// 移除
- appId: ObjectId (required)          // 解耦 App，trainset 不再绑定 App

// 保留
  teamId, tmbId, name, description, status, errorMsg, jobId, createTime, updateTime

// 索引变更
- { appId: 1, createTime: -1 }       // 移除（不再有 appId 字段）
// 其余索引保留不变

// ── rerank_trainset_data Schema ──────────────────────────────
// 移除
- appId: ObjectId (required)          // 解耦 App，训练数据不再冗余存储 appId

// 保留
  trainsetId, teamId, query, positiveDocs, negativeDocs, source, metadata, createTime

// 索引变更
- { appId: 1, createTime: -1 }       // 移除
- { appId: 1, source: 1 }            // 移除
+ { teamId: 1, createTime: -1 }      // 新增：替代原 appId 索引，按团队维度查询
// 其余索引保留不变（如 { trainsetId: 1, createTime: -1 }）
```

**设计说明**：
- trainset 和 trainset data 中的 `appId` **全部移除**（非改为 optional），彻底解耦
- 所有按 `appId` 查询的场景改为按 `teamId` 或 `trainsetId` 查询
- `trainset/controller.ts:createRerankTrainset` 移除 `appId` 参数和 `MongoApp.findById(appId)` 校验
- `data/controller.ts:createManualTrainData` 移除 `appId` 参数
- `data/processor.ts` 移除 `MongoApp.findById(appId)` 校验，`datasetIds` 改为从 job data 直接获取（required）
- `data/mq.ts:RerankTrainDataGenerateJobData` 的 `appId` 移除，`datasetIds` 改为 required
- trainset API 路由（create/list/delete/data/*）的权限校验从 `authApp(appId)` 改为 `authUserPer(teamId)`

#### 3.2.3 新枚举值

```typescript
enum RerankTaskCheckpointStageEnum {
  generate_trainset = 'generate_trainset',        // 原 preparing 重命名：与 generate_evaldataset 对称
  generate_evaldataset = 'generate_evaldataset',  // 新增（原 evaluating 拆分，前移至 finetuning 之前）
  eval_basemodel = 'eval_basemodel',              // 新增（原 evaluating 拆分）
  finetuning = 'finetuning',
  registering = 'registering',
  eval_tunedmodel = 'eval_tunedmodel',            // 新增（原 evaluating 拆分，保留在 registering 之后）
  applying = 'applying'
  // 移除：preparing（重命名）、evaluating（拆分为三个）
}
```

### 3.3 新 API 设计

#### 3.3.1 统一创建接口（合并原 create + create-with-trainset）

```typescript
// POST /api/core/train/rerank/task/create
type CreateRerankTrainTaskRequest = {
  // 两种模式二选一，至少一个非空：
  // 模式 A（精确控制）：显式传入已有的训练集和评估数据集
  trainsetId?: string;                // 已有训练集 ID（必须 ready 状态）
  evalDatasetId?: string;             // 已有评估数据集 ID

  // 模式 B（自动生成）：传入知识库，generate_trainset/generate_evaldataset 阶段自动生成
  datasetIds?: string[];              // 知识库 ID 列表

  // 校验规则：trainsetId 和 datasetIds 至少一个非空；evalDatasetId 和 datasetIds 至少一个非空
  //           trainsetId 与 evalDatasetId 同时传（精确模式）；datasetIds 单独传（自动模式）；混传也支持

  baseModelId: string;                // 基座模型 ID（BaseModelItemType.model）
  newModelName?: string;              // 新模型名称（可选）
  name?: string;                      // 任务名称
}
```

> **接口逻辑**：
> 1. 权限校验改为 `authUserPer(teamId)`（不再依赖 App）
> 2. 参数校验：`trainsetId` 和 `datasetIds` 至少一个非空；`evalDatasetId` 和 `datasetIds` 至少一个非空
> 3. 若 `trainsetId` 已传：校验 trainset 存在且属于当前团队（`trainset.teamId === teamId`）
> 4. 创建任务记录时：`trainsetId`（已有或空）、`evalDatasetId`（已有或空）、`datasetIds`（已传或空）均写入顶层字段
> 5. 各阶段按字段是否有值决定跳过还是生成（见 3.7）

#### 3.3.2 列表接口

```typescript
// POST /api/core/train/rerank/task/list
type ListRerankTrainTaskRequest = {
  baseModelId?: string;               // 新增：按基座模型过滤（图3 入口点击某模型后使用）
  // 移除 appId 过滤
  page?: number;
  pageSize?: number;
}
```

#### 3.3.3 应用训练成果到 App（独立接口）

> 此接口与训练任务本身解耦，专门负责将某个已完成训练任务的成果（新模型）应用到指定的 App 节点中。

```typescript
// POST /api/core/train/rerank/task/apply-to-apps
type ApplyRerankTrainTaskToAppsRequest = {
  taskId: string;        // 训练任务 ID（状态必须为 completed 且 newModelKept === true）
  appIds: string[];      // 要替换 rerank 模型的 App ID 列表
}

type ApplyRerankTrainTaskToAppsResponse = {
  updatedAppsCount: number;  // 成功替换的 App 数量
}
```

**接口逻辑**：
1. 校验 `taskId` 对应任务已完成（`status === 'completed'`）且 `task.result.newModelKept === true`
2. 从 `task.result.tunedModelId` 获取已注册的新模型 ID（等同于 `task.checkpoint.data.registering.tunedModelId`）
3. 遍历 `appIds`，更新每个 App 工作流中 rerank 节点的模型配置为 `tunedModelId`
4. 创建新的 AppVersion 并返回更新数量

### 3.4 Apply 阶段模型保留与清理逻辑

- `baseModelId` 可以是任意可用的 rerank 模型（原始模型或已有 tuned 模型）
- 微调后生成**全新的模型配置**，新增到渠道/模型配置中（`isTuned: true` 由 `createRerankModelConfig` 内部硬编码写入，`newModelName` 作为显示名称）
- Apply 阶段，新模型优于 baseModel 时：
  - 若 `baseModelId` 是 `isTuned` 模型（连续训练场景，如 MA→MB→MC），直接删除 `baseModelId` 对应的旧 tuned model，确保全局只有一个最优 tuned model
  - 若 `baseModelId` 是原始基座模型（非 `isTuned`），无旧 tuned model 需要清理，直接保留新模型
  - 是否将新模型应用到具体 App 由独立的 apply-to-apps 接口负责，训练任务本身不执行 App 替换
- Apply 阶段，新模型**不优于** baseModel 时：删除本次产生的新 tuned model（含 SFT Bridge 侧资源）

### 3.5 `runRegisterStage`

```typescript
async function runRegisterStage(task): Promise<{ tunedModelId: string }> {
  const tunedEndpoint = task.checkpoint.data.finetuning.tunedModelEndpoint

  // tunedModelId = tunedEndpoint.model（SFT Bridge 返回的模型名字符串，非 MongoDB ObjectId）
  // 这与当前代码行为一致：register.ts 中 tunedModelConfigId = tunedEndpoint.model
  // createRerankModelConfig 内部已硬编码 isTuned: true，无需外部传入
  const tunedModelName = task.newModelName || tunedEndpoint.model  // newModelName 为空时使用模型名作为显示名称
  await createRerankModelConfig({
    name: tunedModelName,
    endpoint: tunedEndpoint,
    isActive: true,
    charsPointsPrice: 0
  })

  // tunedModelId 是模型名字符串（tunedEndpoint.model），用于后续 isTunedModel() 判断和 applying 阶段引用
  // createRerankModelConfig 返回的 MongoDB ObjectId 不使用（与当前代码行为一致）
  const tunedModelId = tunedEndpoint.model
  return { tunedModelId }
}
```

> **当前代码现状说明**：
> - `model/controller.ts:createRerankModelConfig` 内部已硬编码 `isTuned: true`（第 54 行），所有通过该函数创建的模型配置均自动标记为微调模型，`isTunedModel()` helper 基于此标志工作。
> - 当前接口签名 `{ name, endpoint, isActive, charsPointsPrice }` **无需新增 `isTuned` 参数**。
> - `tunedModelId` 的值是 `tunedEndpoint.model`（模型名字符串），与当前代码中 `tunedModelConfigId = tunedEndpoint.model` 语义相同，仅重命名去掉 Config 后缀。

### 3.6 `runApplyingStage`（整合决策与清理逻辑）

applying 阶段现在是**决策 + 执行的核心**，整合了原 `handlePreviousModelDeletion` 的逻辑：

```typescript
async function runApplyingStage(task): Promise<ApplyingCheckpointData> {
  const tunedModelId = task.checkpoint.data.registering.tunedModelId
  const tunedModelEvalResult = task.checkpoint.data.eval_tunedmodel.tunedModelEvalResult
  const baseModelEvalResult = task.checkpoint.data.eval_basemodel.baseModelEvalResult

  // 比较基准：baseModelId 对应的评估结果（可以是原始模型或 isTuned 模型）
  // eval_basemodel 阶段已完成评估，无需重新查询
  // 当前 compareEvalPerformance 判定标准：overall_mrr 和 overall_precision 必须同时提升才算"更好"
  const comparisonResult = compareEvalPerformance(baseModelEvalResult, tunedModelEvalResult)

  if (comparisonResult) {
    // ✅ 新模型更好：保留新模型，清理旧模型
    // 若 baseModelId 本身是一个 isTuned 模型（即连续训练场景 MA→MB→MC），
    // 新模型更好时直接删除 baseModelId 对应的旧 tuned model（含 SFT Bridge 侧资源）
    // 若 baseModelId 是原始基座模型（非 isTuned），则无旧 tuned model 需要清理
    if (isTunedModel(task.baseModelId)) {
      // 安全检查：baseModelId 与 tunedModelId 不可能相同（SFT Bridge 总是返回新模型名），无需额外防御
      // 从旧训练任务中取得 baseModelId 对应的 sftTaskId，以释放 SFT Bridge 侧模型资源
      // 注意：查询 key 为 checkpoint.data.registering.tunedModelId（重构后字段名，非旧的 result.tunedModelConfigId）
      const prevTask = await MongoRerankTrainTask.findOne({
        'checkpoint.data.registering.tunedModelId': task.baseModelId
      }, 'checkpoint.data.finetuning.sftTaskId').lean()
      const prevSftTaskId = prevTask?.checkpoint?.data?.finetuning?.sftTaskId
      await deleteRerankModelConfig(task.baseModelId, prevSftTaskId)
    }
    return { newModelKept: true }
  } else {
    // ❌ 新模型更差：删除本次产生的新模型（registering 创建的配置 + SFT Bridge 资源）
    await deleteRerankModelConfig(tunedModelId, task.checkpoint.data.finetuning.sftTaskId)
    return { newModelKept: false }
  }
}
```

原 `handlePreviousModelDeletion` 函数不再作为独立的后处理步骤，其所有逻辑已整合进 `runApplyingStage`。`processor.ts` 完成 applying 阶段后无需额外调用。

### 3.7 `processor.ts` 阶段调度逻辑

新阶段顺序与原有 `shouldRunStage` 方式保持一致（线性推进，已完成的阶段自动跳过）：

```typescript
// 新阶段顺序（核心调度逻辑，基于 shouldRunStage 线性推进）
const stageOrder = [
  RerankTaskCheckpointStageEnum.generate_trainset,   // 原 preparing 重命名
  RerankTaskCheckpointStageEnum.generate_evaldataset,
  RerankTaskCheckpointStageEnum.eval_basemodel,
  RerankTaskCheckpointStageEnum.finetuning,
  RerankTaskCheckpointStageEnum.registering,
  RerankTaskCheckpointStageEnum.eval_tunedmodel,
  RerankTaskCheckpointStageEnum.applying,
]

// ── generate_trainset 阶段（原 preparing，新增自动生成分支）────────────────────
async function runGenerateTrainsetStage(task) {
  if (!task.trainsetId) {
    // 自动模式：trainsetId 为空，先创建 trainset 并触发训练数据生成队列
    const [{ _id: trainsetId }] = await MongoRerankTrainset.create([{
      teamId: task.teamId, tmbId: task.tmbId,
      name: `Training Set - ${task.name}`, status: RerankTrainsetStatusEnum.pending
    }])
    // RerankTrainDataGenerateJobData 重构后移除 appId，datasetIds 改为 required
    // data/processor.ts 直接使用 datasetIds，不再从 App 提取
    await rerankTrainDataGenerateQueue.add({ trainsetId: String(trainsetId), datasetIds: task.datasetIds })
    // 回写顶层字段，后续阶段重试时无需重新创建
    await MongoRerankTrainTask.updateOne({ _id: task._id }, { trainsetId: String(trainsetId) })
    task = { ...task, trainsetId: String(trainsetId) }
  }
  // 精确模式 & 自动模式均：waitForTrainsetReady → 生成 JSONL 文件（与原 preparing 逻辑相同）
  await waitForTrainsetReady(String(task.trainsetId))
  const { trainDatasetId, trainDatasetFilePath } = await generateTrainsetJsonl(task)
  return { trainDatasetId, trainDatasetFilePath }
}

// ── generate_evaldataset 阶段（与 generate_trainset 完全对称）────────────────────
async function runGenerateEvalDatasetStage(task) {
  if (task.evalDatasetId) {
    // 精确模式：evalDatasetId 已有值，直接写入 checkpoint，跳过生成
    return { evalDatasetId: task.evalDatasetId }
  }
  // 自动模式：evalDatasetId 为空，从 task.datasetIds 采样调用 DiTing 生成
  const evalDatasetId = await generateEvalDatasetFromDatasets(task)
  // 回写顶层字段，后续阶段重试时可直接跳过
  await MongoRerankTrainTask.updateOne({ _id: task._id }, { evalDatasetId })
  return { evalDatasetId }
}

// applying 完成后无需额外调用 handlePreviousModelDeletion（已整合进 runApplyingStage）
```

---

## 4. 完整阶段流转（含逻辑判断）

```
[create API]
  精确模式：trainsetId（ready）+ evalDatasetId + baseModelId
  自动模式：datasetIds + baseModelId（训练集和评估集由各阶段自动生成）
  newModelName（可选）
      ↓
[generate_trainset]  ← 原 preparing 重命名，新增自动生成分支
  task.trainsetId 为空（自动模式）→ 创建 trainset，触发训练数据生成队列，回写 task.trainsetId
  task.trainsetId 非空（精确模式）→ 跳过创建
  两种模式均：waitForTrainsetReady → 生成 JSONL 文件
      ↓
[generate_evaldataset]  ← 与 generate_trainset 完全对称
  task.evalDatasetId 为空（自动模式）→ 从 task.datasetIds 采样调用 DiTing 生成，回写 task.evalDatasetId
  task.evalDatasetId 非空（精确模式）→ 直接写入 checkpoint 跳过生成
  fail-fast：若 DiTing 不可用，在微调前发现
      ↓
[eval_basemodel]
  用 baseModelId 对应的模型在评估集上评估，建立 baseline
      ↓
[finetuning]
  调用 SFT Bridge 正常微调，产生 tunedModelEndpoint（新 model ID ≠ baseModelId）
      ↓
[registering]
  创建新模型配置（isTuned: true）+ AI Proxy channel，返回 tunedModelId
      ↓
[eval_tunedmodel]
  用 tunedModelId 在评估集上评估
      ↓
[applying]  ← 核心决策阶段，整合了原 handlePreviousModelDeletion 逻辑

  判断：compareEvalPerformance(baseModelEvalResult, tunedModelEvalResult)
  // 比较基准始终是 baseModelEvalResult，无论 baseModelId 是原始模型还是 isTuned 模型

  ┌─ true（新模型更好）
  │   若 baseModelId 是 isTuned 模型（连续训练 MA→MB→MC）：
  │     查询前置任务获取 prevSftTaskId → deleteRerankModelConfig(baseModelId, prevSftTaskId)
  │   若 baseModelId 是原始模型（非 isTuned）：无需清理
  │   保留本次 tunedModelId，等待用户通过 apply-to-apps 接口替换 App
  │
  └─ false（新模型更差）
      deleteRerankModelConfig(tunedModelId, currentSftTaskId)   // 删除本次产生的新模型

  最终写入 checkpoint.data.applying:
    { newModelKept }
```

---

## 5. 数据迁移

> 无需兼容历史数据（上一版本无生产用户），直接按新 Schema 重建即可。

### 5.1 顶层字段变更

| 原字段 | 变更 | 说明 |
|--------|------|------|
| `appId: ObjectId` | **移除** | 解耦 App |
| `baseModelConfigId: string` | **重命名**为 `baseModelId: string` | 语义更清晰，去掉 Config 后缀 |
| `baseModelEndpoint` | 保留 | 来源变更：原从 App workflow 提取后固化；重构后在 create 时根据 `baseModelId` 调用 `getRerankModel(baseModelId)` 获取模型配置并 `buildModelEndpoint` 固化写入 |
| `trainsetId` | 从 required 改为 **optional** | 精确模式创建时传入；自动模式创建时为空，由 generate_trainset 阶段生成后回写 |
| — | **新增** `evalDatasetId?: string` | 评估数据集 ID（精确模式：create 接口由调用方传入；自动模式：由 generate_evaldataset 阶段生成后回写） |
| — | **新增** `datasetIds?: string[]` | 知识库 ID 列表（仅自动模式使用，作为 generate_trainset/generate_evaldataset 的数据来源） |
| — | **新增** `newModelName?: string` | 新模型名称（可选） |

### 5.2 checkpoint.data 字段变更

| 原字段 | 变更 | 说明 |
|--------|------|------|
| `preparing.trainDatasetId` | **迁移**至 `generate_trainset.trainDatasetId` | stage 重命名 |
| `preparing.trainDatasetFilePath` | **迁移**至 `generate_trainset.trainDatasetFilePath` | stage 重命名 |
| `registering.tunedModelConfigId: string` | **重命名**为 `registering.tunedModelId: string` | 去掉 Config 后缀 |
| `evaluating.evalDatasetId` | **迁移**至 `generate_evaldataset.evalDatasetId` | stage 拆分前移 |
| `evaluating.baseModelEvalResult` | **迁移**至 `eval_basemodel.baseModelEvalResult` | stage 拆分前移 |
| `evaluating.tunedModelEvalResult` | **迁移**至 `eval_tunedmodel.tunedModelEvalResult` | stage 拆分后移 |
| `applying.versionId` | **移除** | applying 阶段不再负责 App 替换 |
| `applying.versionName` | **移除** | 同上 |
| `applying.previousModelConfigId` | **移除** | 同上 |
| `applying.previousTaskId` | **移除** | 同上 |
| `applying.updatedNodesCount` | **移除** | 同上 |
| — | **新增** `applying.newModelKept: boolean` | 模型质量决策结果 |

### 5.3 checkpoint.stageEndTime 变更

| 原字段 | 变更 |
|--------|------|
| `stageEndTime.preparing` | **重命名**为 `stageEndTime.generate_trainset` |
| `stageEndTime.evaluating` | **移除** |
| — | **新增** `stageEndTime.generate_evaldataset` |
| — | **新增** `stageEndTime.eval_basemodel` |
| — | **新增** `stageEndTime.eval_tunedmodel` |

### 5.4 result 字段变更

`result` 是任务完成时由 `processor.ts` 从 checkpoint 各阶段快照写入的最终汇总字段，随 checkpoint 同步更新：

| 原字段 | 变更 | 说明 |
|--------|------|------|
| `result.tunedModelConfigId` | **重命名**为 `result.tunedModelId` | 与 checkpoint 命名一致 |
| `result.evalDatasetId` | 保留 | 来源从 `evaluating` 改为 `generate_evaldataset` |
| `result.baseModelEvalResult` | 保留 | 来源从 `evaluating` 改为 `eval_basemodel` |
| `result.tunedModelEvalResult` | 保留 | 来源从 `evaluating` 改为 `eval_tunedmodel` |
| `result.versionId` | **移除** | applying 阶段不再写入版本信息 |
| `result.versionName` | **移除** | 同上 |
| `result.previousModelConfigId` | **移除** | 同上 |
| `result.previousTaskId` | **移除** | 同上 |
| `result.updatedNodesCount` | **移除** | 同上 |
| — | **新增** `result.newModelKept: boolean` | 来源于 `applying.newModelKept` |

### 5.5 索引变更

| 原索引 | 变更 |
|--------|------|
| `{ appId: 1, createTime: -1 }` | **移除** |
| `{ appId: 1, status: 1, createTime: -1 }` | **移除** |
| — | **新增** `{ baseModelId: 1, status: 1, createTime: -1 }` |

**以下现有索引保留不变**：

| 保留索引 | 用途 |
|---------|------|
| `{ trainsetId: 1, createTime: -1 }` | 按训练集查询关联任务 |
| `{ teamId: 1, status: 1 }` | 团队维度任务状态查询 |
| `{ status: 1, updateTime: 1 }` | Worker 轮询待处理任务 |
| `{ jobId: 1 }` | BullMQ jobId 查找 |
| `{ 'checkpoint.stage': 1, status: 1 }` | 按阶段+状态查询（调试/监控） |
| `{ teamId: 1, status: 1, createTime: -1 }` | 团队维度分页列表 |

---

## 6. API 变更详细设计

### 6.1 create（合并 + 重写）

原 `create.ts` 与 `create-with-trainset.ts` **合并为单一接口**，`create-with-trainset.ts` 文件删除。

```typescript
// POST /api/core/train/rerank/task/create
type CreateRerankTrainTaskRequest = {
  // 精确模式（传 trainsetId + evalDatasetId）与自动模式（传 datasetIds）二选一
  // 校验规则：(trainsetId && evalDatasetId) || datasetIds，否则报 missingParams
  trainsetId?: string;                // 精确模式：已有训练集 ID（必须 ready 状态，且 teamId 匹配）
  evalDatasetId?: string;             // 精确模式：已有评估数据集 ID
  datasetIds?: string[];              // 自动模式：知识库 ID 列表（generate_trainset/generate_evaldataset 阶段据此生成训练集和评估集）

  baseModelId: string;                // 基座模型 ID（替换 appId）
  newModelName?: string;              // 可选
  name?: string;
}
```

**接口逻辑变更**：
- 权限校验：`authApp(appId)` → `authUserPer(teamId)`（不再依赖 App）
- 移除 `validateDatasetSynthesisIndexes(app)` 调用
- 参数校验：`(trainsetId && evalDatasetId) || datasetIds`，否则报 `missingParams`
- 若传 `trainsetId`：校验 trainset 存在且 `trainset.teamId === teamId`（不再校验 appId）
- 若未传 `trainsetId`（自动模式）：接口内**不再**自动创建 trainset（职责下沉至 `generate_trainset` 阶段）
- 进行中任务检查：改为基于 `baseModelId` 而非 `appId`；检查范围为 `status: { $in: ['running', 'pending'] }`（pending 任务也应阻止重复创建）
- 创建任务记录时写入所有顶层字段：`trainsetId`（可空）、`evalDatasetId`（可空）、`datasetIds`（可空）、`baseModelId` 等

---

### 6.2 list（修改）

```typescript
// POST /api/core/train/rerank/task/list
type ListRerankTrainTasksRequest = PaginationProps<
  {
    baseModelId?: string;     // 替换 appId：按基座模型过滤
    tunedModelId?: string;    // 新增：按产出的 tuned model 溯源过滤（见下方查询逻辑）
    status?: `${RerankTrainTaskStatusEnum}`;
  } & SortParams<'createTime' | 'updateTime' | 'finishTime'>
>;

type RerankTrainTaskListItem = RerankTrainTaskSchemaType & {
  creatorName?: string;
  creatorAvatar?: string;
  // 移除 appName、appAvatar（任务不再绑定 App）
};
type ListRerankTrainTasksResponse = PaginationResponse<RerankTrainTaskListItem>;
```

**`tunedModelId` 过滤的查询逻辑**：

该参数用于查询"与某个 tuned model 关联的所有训练历史"，沿 baseModelId 链向上溯源。

```
示例：MA -task1-> MB -task2-> MC
  - tunedModelId=MC：返回 [task2, task1]
    （task2.registering.tunedModelId=MC；task1.registering.tunedModelId=MB，MB 是 task2 的 baseModelId）
  - tunedModelId=MB：返回 [task1]
  - tunedModelId=MA：返回 []（MA 非 isTuned，没有任何任务产出它）
```

**服务端实现逻辑**（递归展开 baseModelId 链）：

```typescript
async function resolveTasksByTunedModelId(tunedModelId: string, teamId: string) {
  const result: Task[] = []
  let currentId = tunedModelId

  while (true) {
    // 查找直接产出 currentId 的任务：checkpoint.data.registering.tunedModelId === currentId
    const task = await MongoRerankTrainTask.findOne({
      teamId,
      'checkpoint.data.registering.tunedModelId': currentId
    }).lean()

    if (!task) break

    result.push(task)
    // 继续向上：以 task 的 baseModelId 为下一个查找目标
    currentId = task.baseModelId
  }

  return result  // 按时间降序（最新任务在前）
}
```

> 注意：该查询为链式迭代（每步一次 DB 查询），链路深度通常较浅（实际训练次数有限），可接受。若有性能顾虑，可在任务创建时将祖先链 ID 写入 `ancestorModelIds[]` 字段，支持 `$in` 一次查询。当前版本采用迭代方案，简单直接。

---

### 6.3 detail（修改）

```typescript
// GET /api/core/train/rerank/task/detail?taskId=xxx
type RerankTrainTaskDetailResponse = RerankTrainTaskSchemaType & {
  creatorName?: string;
  creatorAvatar?: string;
  // 移除 appName、appAvatar
};
```

权限校验：从 `authApp(task.appId)` 改为 `authUserPer(teamId)`。

---

### 6.4 cancel（修改）

```typescript
// POST /api/core/train/rerank/task/cancel
// 请求参数不变：{ taskId }
```

权限校验：从 `authApp(task.appId)` 改为 `authUserPer(teamId)`。

---

### 6.5 delete（修改）

```typescript
// DELETE /api/core/train/rerank/task/delete?taskId=xxx
// 请求参数不变：{ taskId }
// 约束不变：pending/running 状态不可删除
```

权限校验：从 `authApp(task.appId)` 改为 `authUserPer(teamId)`。

---

### 6.6 delete-all-by-app（移除）

原接口 `DELETE /api/core/train/rerank/task/delete-all-by-app` **整体移除**。

理由：训练任务不再绑定 App，按 appId 批量删除的场景不复存在。若需批量删除，前端通过 list + 逐条 delete 实现。

---

### 6.7 retry（不变）

```typescript
// POST /api/core/train/rerank/task/retry
// 请求参数不变：{ taskId }
```

权限校验同步修改：从 `authApp(task.appId)` 改为 `authUserPer(teamId)`（若当前 retry.ts 有此校验）。

---

### 6.8 apply-to-apps（新增）

见 3.3.3 节。

---

## 7. 影响范围与实施清单

### 7.1 后端变更

| 文件 | 变更类型 | 关键说明 |
|------|----------|----------|
| `packages/global/core/train/rerank/constants.ts` | 修改 | `preparing` 重命名为 `generate_trainset`；`evaluating` 拆分为 `generate_evaldataset` / `eval_basemodel` / `eval_tunedmodel`，调整枚举顺序 |
| `packages/global/core/train/rerank/type.d.ts` | 修改 | `RerankTrainTaskSchemaType`：移除 `appId`；新增 `evalDatasetId?/datasetIds?/newModelName?`；`baseModelConfigId` 重命名为 `baseModelId`；`trainsetId` 改为 optional；checkpoint.data 结构对应新 7 阶段名；result 字段同步更新。`RerankTrainsetSchemaType`：移除 `appId`。`RerankTrainsetDataSchemaType`：移除 `appId` |
| `packages/global/core/train/rerank/api.d.ts` | 修改 | 合并 `CreateRerankTrainTaskRequest` 与 `CreateRerankTrainTaskWithTrainsetRequest` 为单一类型（支持精确模式+自动模式）；`CreateRerankTrainsetRequest` 移除 `appId` 字段；`ListRerankTrainsetsRequest` 移除 `appId` 过滤；移除 appName/appAvatar 相关类型；新增 `ApplyRerankTrainTaskToAppsRequest`；移除 `DeleteAllRerankTrainTasksByAppRequest/Response` |
| `packages/service/core/train/rerank/trainset/schema.ts` | 修改 | 移除 `appId` 字段及 `{ appId: 1, createTime: -1 }` 索引；trainset 仅通过 `teamId` 关联团队 |
| `packages/service/core/train/rerank/task/schema.ts` | 修改 | 新增 evalDatasetId/datasetIds/newModelName；移除 appId；trainsetId 改为 optional；更新索引 |
| `packages/service/core/train/rerank/task/controller.ts` | 修改 | `createRerankTrainTask` 移除 appId 参数、改为接收 baseModelId 并调用 `getRerankModel/buildModelEndpoint` 构建 baseModelEndpoint；`deleteRerankTrainTask` 移除 AppVersion 回滚逻辑（重构后 applying 不产生 versionId）；`deleteAllRerankTrainTasksByApp` 函数移除；`updateCheckpointData` 的 stage 联合类型更新为 7 个新阶段名 |
| `packages/service/core/train/rerank/task/processor.ts` | 修改 | 阶段顺序调整为新枚举顺序（7个阶段）；移除 handlePreviousModelDeletion 后处理调用（逻辑整合进 runApplyingStage）；result 字段 key 同步新名称（`tunedModelConfigId → tunedModelId` 等）；`shouldRunStage` 的 stageOrder 数组更新 |
| `packages/service/core/train/rerank/task/stages/prepare.ts` | 重命名+修改 | 改为 `generate-trainset.ts`；新增 trainsetId 为空时的自动创建 + 触发生成队列逻辑 |
| `packages/service/core/train/rerank/task/stages/evaluate.ts` | 重写 | 拆分为 `generate-evaldataset.ts` / `eval-basemodel.ts` / `eval-tunedmodel.ts` 三个独立阶段文件；generate-evaldataset 移除 `task.appId` 查 App 依赖，改为直接从 `task.datasetIds` 采样 |
| `packages/service/core/train/rerank/task/stages/register.ts` | 修改 | 返回字段名由 `tunedModelConfigId` 改为 `tunedModelId`（值不变，仍为 `tunedEndpoint.model` 字符串）；新增 `task.newModelName` 支持（为空时仍使用 `tunedEndpoint.model` 作为默认名称，与现有行为一致）；字段名 `task.baseModelConfigId` → `task.baseModelId` |
| `packages/service/core/train/rerank/task/stages/apply.ts` | 重写 | 整合决策+清理逻辑；新模型更好时清理旧 isTuned baseModel，新模型更差时删除本次产生的 tuned model |
| `packages/service/core/train/rerank/model/controller.ts` | 确认不变 | `createRerankModelConfig` 内部已硬编码 `isTuned: true`（第 54 行），无需新增参数。`isTunedModel()` helper 基于此标志正常工作。接口签名 `{ name, endpoint, isActive, charsPointsPrice }` 保持不变 |
| `packages/service/core/train/rerank/data/processor.ts` | 修改 | 移除 `appId` 相关逻辑：1) 移除 `MongoApp.findById(appId)` 校验（第 100-108 行）；2) 移除 `extractDatasetIdsFromApp(app)` fallback（第 111 行），改为直接使用 job data 的 `datasetIds`（required）；3) 创建训练数据时不再写入 `appId` 字段（第 188 行） |
| `packages/service/core/train/rerank/data/mq.ts` | 修改 | `RerankTrainDataGenerateJobData` 类型：移除 `appId` 字段，`datasetIds` 从 optional 改为 required（`datasetIds: string[]`） |
| `packages/service/core/train/rerank/data/schema.ts` | 修改 | 移除 `appId` 字段（required → 移除）；移除 `{ appId: 1, createTime: -1 }` 和 `{ appId: 1, source: 1 }` 两个索引；新增 `{ teamId: 1, createTime: -1 }` 索引 |
| `packages/service/core/train/rerank/data/controller.ts` | 修改 | `createManualTrainData` 移除 `appId` 参数，创建训练数据记录时不再写入 `appId` |
| `packages/service/core/train/rerank/data/worker.ts` | 修改 | 移除 job data 中 `appId` 的解构和日志引用（仅用于日志，无业务逻辑） |
| `packages/service/core/train/rerank/trainset/controller.ts` | 修改 | `createRerankTrainset` 移除 `appId` 参数；移除 `MongoApp.findById(appId)` 校验；创建文档时不再写入 `appId` |
| `packages/service/core/train/rerank/task/stages/finetune.ts` | 不变 | 无需修改 |
| `projects/app/src/pages/api/core/train/rerank/task/create.ts` | 重写 | 合并原 create + create-with-trainset；支持精确模式（trainsetId+evalDatasetId）和自动模式（datasetIds）；权限校验改为 authUserPer；移除 appId 参数，新增 baseModelId/datasetIds/evalDatasetId/newModelName；trainset/evalDataset 自动创建职责下沉到各 generate 阶段 |
| `projects/app/src/pages/api/core/train/rerank/task/create-with-trainset.ts` | **删除** | 职责完全合并入 create.ts |
| `projects/app/src/pages/api/core/train/rerank/task/list.ts` | 修改 | 改为 POST 方法（与现有实现一致）；移除 appId 过滤，新增 baseModelId/tunedModelId 过滤；tunedModelId 触发链式溯源查询 |
| `projects/app/src/pages/api/core/train/rerank/task/detail.ts` | 修改 | 权限校验从 authApp 改为 authUserPer；响应移除 appName/appAvatar |
| `projects/app/src/pages/api/core/train/rerank/task/cancel.ts` | 修改 | 权限校验从 authApp(task.appId) 改为 authUserPer(teamId) |
| `projects/app/src/pages/api/core/train/rerank/task/delete.ts` | 修改 | 权限校验从 authApp(task.appId) 改为 authUserPer(teamId) |
| `projects/app/src/pages/api/core/train/rerank/task/delete-all-by-app.ts` | **删除** | 训练任务不再绑定 App，按 appId 批量删除场景不复存在 |
| `projects/app/src/pages/api/core/train/rerank/task/retry.ts` | 修改 | 权限校验从 authApp 改为 authUserPer（若有） |
| `projects/app/src/pages/api/core/train/rerank/task/eval-dataset.ts` | 修改 | 权限校验从 authApp 改为 authUserPer |
| `projects/app/src/pages/api/core/train/rerank/task/eval-report.ts` | 修改 | 权限校验从 authApp 改为 authUserPer |
| `projects/app/src/pages/api/core/train/rerank/task/apply-to-apps.ts` | **新增** | 独立的应用训练成果到 App 节点的接口（见 3.3.3） |
| `projects/app/src/pages/api/core/train/rerank/trainset/create.ts` | 修改 | 移除 `appId` 必填参数和 `authApp(appId)` 校验；权限改为 `authUserPer(teamId)` |
| `projects/app/src/pages/api/core/train/rerank/trainset/list.ts` | 修改 | 移除 `appId` 可选过滤；移除 appName/appAvatar 的 hydrate 逻辑；改为按 `teamId` 过滤 |
| `projects/app/src/pages/api/core/train/rerank/trainset/delete.ts` | 修改 | 运行中任务检查改为按 `trainsetId` 查询而非 `appId`；权限校验改为 `authUserPer(teamId)` |
| `projects/app/src/pages/api/core/train/rerank/trainset/data/create.ts` | 修改 | 移除从 `trainset.appId` 派生 appId 的逻辑；`createManualTrainData` 调用时不传 `appId` |
| `projects/app/src/pages/api/core/train/rerank/trainset/data/generate.ts` | 修改 | 移除从 `trainset.appId` 派生 appId 的 `authApp()` 校验；队列 payload 中移除 `appId`，`datasetIds` 改为 required |

### 7.2 前端变更

| 组件/页面 | 变更类型 | 说明 |
|-----------|----------|------|
| 模型管理页面（可用模型 Tab） | 修改 | 新增"训练"按钮，点击打开训练弹窗 |
| 训练模型弹窗（新组件） | 新增 | 表单：选基座模型（只读）、模型名称（可选）、知识库列表（多选） |
| 训练任务列表（模型详情侧边栏） | 新增 | 按 baseModelId 过滤的训练历史，展示训练状态与评估对比结果 |
| 应用训练成果弹窗（新组件） | 新增 | 针对已完成且 newModelKept=true 的训练任务，选择要替换 rerank 模型的 App 列表，调用 apply-to-apps 接口 |
| 原 App 内的自动学习/训练入口 (`AutoLearn/index.tsx`) | 移除 | 整个组件基于 `AppContext.appId` 构建，解耦后不再需要 |
| 前端 API 客户端 (`web/core/app/api/train.ts`) | 修改 | 移除 `deleteAllRerankTrainTasksByApp` 函数；其余函数的类型定义随 `api.d.ts` 同步更新 |
