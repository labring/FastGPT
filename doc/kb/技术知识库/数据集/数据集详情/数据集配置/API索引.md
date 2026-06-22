---
capability_label: 数据集配置
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T10:44:40Z
parent_module: 数据集详情
roles: [管理员, 协作者]
router_paths: [/dataset/detail?currentTab=info]
---

# 数据集配置 — API索引

## 数据集详情与更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/dataset/detail | GET | 获取数据集详情 | `projects/app/src/web/core/dataset/api.ts:145` → `projects/app/src/web/core/dataset/context/datasetPageContext.tsx:107` | 数据集→数据集详情→页面加载时调用；数据集→数据集详情→状态为syncing/waiting时每10秒轮询；重建嵌入成功后刷新 |
| /core/dataset/update | PUT | 更新数据集配置 | `projects/app/src/web/core/dataset/api.ts:153` → `projects/app/src/web/core/dataset/context/datasetPageContext.tsx:116` | 数据集→数据集配置→切换Agent模型时调用；数据集→数据集配置→切换VLM模型时调用；数据集→数据集配置→保存外部读取地址时调用；数据集→数据集配置→切换自动同步时调用；数据集→数据集配置→编辑基本信息时调用；数据集→数据集配置→编辑API/语雀/飞书配置时调用 |

## 训练与索引

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/dataset/training/rebuildEmbedding | POST | 重建向量嵌入索引 | `projects/app/src/web/core/dataset/api.ts:449` → `projects/app/src/pageComponents/dataset/detail/Info/index.tsx:120` | 数据集→数据集配置→切换向量模型→确认重建弹窗后调用 |

## 协作者管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /proApi/core/dataset/collaborator/list | GET | 获取协作者列表 | `projects/app/src/web/core/dataset/api/collaborator.ts:13` → `projects/app/src/pageComponents/dataset/detail/Info/index.tsx:452` | 数据集→数据集配置→加载协作者区域时调用 |
| /proApi/core/dataset/collaborator/update | POST | 更新协作者权限 | `projects/app/src/web/core/dataset/api/collaborator.ts:16` → `projects/app/src/pageComponents/dataset/detail/Info/index.tsx:455` | 数据集→数据集配置→协作者管理弹窗→添加/修改协作者角色时调用 |
| /proApi/core/dataset/collaborator/delete | DELETE | 删除协作者 | `projects/app/src/web/core/dataset/api/collaborator.ts:19` → `projects/app/src/pageComponents/dataset/detail/Info/index.tsx:461` | 数据集→数据集配置→协作者管理弹窗→移除协作者时调用 |

## API 调用链追踪

### `/core/dataset/detail` 调用链

```
DatasetPageContextProvider.loadDatasetDetail
  ├── 触发: 页面初始化 / 重建嵌入成功后 / 同步状态轮询
  ├── 参数: datasetId
  └── 响应处理: 更新 datasetDetail 状态（包括 permission, type, vectorModel, agentModel, vlmModel, autoSync 等字段）

Info 组件（useContextSelector）
  ├── 触发: datasetDetail 状态变更时自动重渲染
  └── 响应处理: 通过 useForm reset 同步表单默认值
```

### `/core/dataset/update` 调用链

```
DatasetPageContextProvider.updateDataset
  ├── 触发: Info 组件中 onSave / onEditBaseInfo / 开关切换
  ├── 参数: { id, agentModelId?, vlmModelId?, externalReadUrl?, autoSync?, name?, intro?, avatar?, apiDatasetServer? }
  └── 响应处理: 局部更新 datasetDetail 状态（按传入字段合并）；模型字段通过 getWebLLMModel/getWebEmbeddingModel 转换为完整模型对象

Info.onSave (useRequest)
  ├── 触发: Agent模型/VLM模型下拉切换、外部读取地址失焦
  ├── 参数: { id, agentModelId, vlmModelId, externalReadUrl }
  └── 响应处理: 成功 toast "更新成功"；失败 toast "更新失败"

Info.onEditBaseInfo (useRequest)
  ├── 触发: EditResourceModal 确认编辑
  ├── 参数: { id, name, intro, avatar }
  └── 响应处理: 成功关闭弹窗 + toast "更新成功"；失败 toast "更新失败"
```

### `/core/dataset/training/rebuildEmbedding` 调用链

```
Info.onRebuilding (useRequest)
  ├── 触发: 向量模型确认重建弹窗 → 用户点击确认
  ├── 参数: { datasetId, vectorModelId }
  └── 响应处理: 成功 → refetchDatasetTraining() 刷新训练队列 + loadDatasetDetail(datasetId) 刷新详情 + toast "重建嵌入已开始"；失败 → toast "更新失败"
```

### `/proApi/core/dataset/collaborator/list` 调用链

```
MemberManager → CollaboratorContextProvider
  ├── 触发: 组件挂载时自动调用（manual: false）
  ├── 参数: { datasetId }
  └── 响应处理: 返回 clbs（协作者列表）和 parentClbs（父级协作者列表），每个协作者 permission 被包装为 Permission 实例

  ├── 前置条件: feConfigs.isPlus = true 时才发起请求；否则返回空列表
  └── 刷新依赖: refreshDeps 数组变更时重新请求
```

### `/proApi/core/dataset/collaborator/update` 调用链

```
MemberManager → CollaboratorContextProvider.onUpdateCollaboratorsThen
  ├── 触发: MemberModal 中确认添加/修改协作者
  ├── 参数: { datasetId, tmbId/groupId/orgId, role }
  └── 响应处理: 成功后 refetchCollaboratorList() 刷新列表
```

### `/proApi/core/dataset/collaborator/delete` 调用链

```
MemberManager → CollaboratorContextProvider.onDelOneCollaboratorThen
  ├── 触发: MemberModal 中移除协作者
  ├── 参数: { datasetId, tmbId/groupId/orgId }（三者必填其一）
  └── 响应处理: 成功后 refetchCollaboratorList() 刷新列表
```
