---
capability_label: "活跃模型"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T11:30:00Z"
parent_module: "模型管理"
roles: ["root", "团队管理员", "团队成员"]
router_paths: ["/account/model"]
---

# 活跃模型 — API索引

## 说明

活跃模型模块主要通过 `useSystemStore` 获取全局缓存的模型数据，不单独请求模型列表 API。模型数据的获取在系统初始化时由 `clientInitData()` → `getInitData` API 统一完成。本模块仅在特定操作场景中直接发起 API 请求。

---

## 模型训练

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/train/embedding/task/create` | POST | 创建向量模型训练任务 | `projects/app/src/web/core/app/api/train.ts:28` → `BaseModelTrainModal.tsx:402` | 账户→模型管理→活跃模型→训练弹窗→提交 embedding 训练时调用 |
| `/core/train/rerank/task/create` | POST | 创建重排模型训练任务 | `projects/app/src/web/core/app/api/train.ts:52` → `BaseModelTrainModal.tsx:405` | 账户→模型管理→活跃模型→训练弹窗→提交 reRank 训练时调用 |
| `/core/train/embedding/task/list` | POST | 获取向量模型训练任务列表 | `projects/app/src/web/core/app/api/train.ts:34` → `TrainDetailDrawer.tsx` | 账户→模型管理→活跃模型→自定义模型→训练详情抽屉→加载时调用 |
| `/core/train/rerank/task/list` | POST | 获取重排模型训练任务列表 | `projects/app/src/web/core/app/api/train.ts:64` → `TrainDetailDrawer.tsx` | 账户→模型管理→活跃模型→自定义模型→训练详情抽屉→加载时调用 |

---

## 权限管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/common/system/updateModelCollaborators` | POST | 批量更新模型协作权限 | `projects/app/src/web/common/system/api.ts` → `BatchPermissionActionBar.tsx:40` | 账户→模型管理→活跃模型→批量勾选模型→权限配置→提交协作者时调用 |

---

## 系统配置

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/common/system/updateDefaultModels` | PUT | 更新各类型的系统默认模型 | 通过 `putUpdateDefaultModels`（系统 API 层） → `DefaultModelModal.tsx` | 账户→模型管理→活跃模型→默认模型弹窗→root 保存默认模型时调用 |

---

## 知识库查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/list` | GET | 获取团队知识库树（含子节点） | `projects/app/src/web/core/app/api/dataset.ts` → `ModelListTable.tsx:147`<br>`BaseModelTrainModal.tsx:124` | 活跃模型→自定义模型Tab→加载训练数据列名称时调用；活跃模型→训练弹窗→加载可选知识库树时调用 |

---

## 全局数据刷新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/common/system/getInitData` | GET | 获取系统初始化数据（含全部模型列表） | 通过 `clientInitData()` → `DefaultModelModal.tsx`<br>`BaseModelTrainModal.tsx`<br>`TrainDetailDrawer.tsx`<br>`BatchPermissionActionBar.tsx` | 活跃模型→训练任务创建成功后调用刷新；默认模型保存成功后调用刷新；训练详情关闭后调用刷新；权限配置成功后调用刷新 |

---

## API 调用链追踪

### `/core/train/embedding/task/create` 调用链

```
BaseModelTrainModal（训练弹窗）
  ├── 触发: 用户选择训练数据集并确认提交，且基座类型为 embedding
  ├── 参数: { baseModelId, datasetIds, newModelName }
  └── 响应处理: onSuccess → onSuccess?.() + onClose()，触发 clientInitData 全局刷新
```

### `/core/train/rerank/task/create` 调用链

```
BaseModelTrainModal（训练弹窗）
  ├── 触发: 用户选择训练数据集并确认提交，且基座类型为 reRank
  ├── 参数: { baseModelId, datasetIds, newModelName }
  └── 响应处理: onSuccess → onSuccess?.() + onClose()，触发 clientInitData 全局刷新
```

### `/core/train/embedding/task/list` 调用链

```
TrainDetailDrawer（训练详情抽屉）
  ├── 触发: 抽屉打开时 useRequest 自动发起，模型类型为 embedding
  ├── 参数: { modelId }
  └── 响应处理: 渲染训练任务列表（状态、创建时间、进度等）
```

### `/core/train/rerank/task/list` 调用链

```
TrainDetailDrawer（训练详情抽屉）
  ├── 触发: 抽屉打开时 useRequest 自动发起，模型类型为 reRank
  ├── 参数: { modelId }
  └── 响应处理: 渲染训练任务列表（状态、创建时间、进度等）
```

### `/common/system/updateModelCollaborators` 调用链

```
BatchPermissionActionBar（批量权限操作栏）
  ├── 触发: 用户在协作者弹窗中选择成员和角色后点击确认
  ├── 参数: { collaborators, modelIds }
  └── 响应处理: 弹窗关闭，列表数据刷新

AddModelBox / ModelConfigTable（添加/编辑模型弹窗）[跨模块引用]
  ├── 触发: 保存模型配置时包含协作者信息
  ├── 参数: { collaborators, modelIds }
  └── 响应处理: 弹窗关闭
```

### `/core/dataset/list` 调用链

```
ModelListTable（模型列表表格）
  ├── 触发: 切换到自定义模型 Tab 时 useEffect 自动发起
  ├── 参数: { parentId: null }
  └── 响应处理: 递归遍历知识库树，构建 datasetId → 知识库名称映射，用于训练数据列渲染

BaseModelTrainModal（训练弹窗）
  ├── 触发: 弹窗打开时 useRequest 自动发起
  ├── 参数: { parentId: null }
  └── 响应处理: 构建知识库树状态快照（TreeNode/leafDescendantMap），渲染可选数据集列表
```

### `/common/system/getInitData` 调用链

```
clientInitData() 全局刷新（多处调用）
  ├── 触发: 训练任务创建成功后
  ├── 触发: 默认模型保存成功后
  ├── 触发: 训练详情操作后
  ├── 触发: 权限配置成功后
  └── 响应处理: 更新 useSystemStore 中全部模型列表数据
```
