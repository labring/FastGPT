---
capability_label: 评测数据集详情
doc_type: "12"
doc_label: "API索引"
generated_at: 2026-06-18T12:00:00+08:00
parent_module: 评测数据集
roles: []
router_paths: ["/dashboard/evaluation/dataset/detail"]
---

# 评测数据集详情 — API 索引

## 查询/详情

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/detail?collectionId={id}` | GET | 获取评测数据集详情（含评测模型配置） | `src/web/core/evaluation/dataset.ts:110` → `pageComponents/.../detail/DataListModals.tsx:96` | 工作台→评测→评测数据集详情→设置弹窗打开时调用 |

## 数据列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/list` | POST | 获取数据集数据列表（分页） | `src/web/core/evaluation/dataset.ts:63` → `pageComponents/.../detail/DataList.tsx:121` | 工作台→评测→评测数据集详情→加载/搜索/筛选/滚动分页时调用 |

## 数据修改

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/update` | POST | 编辑数据集数据（用户问题和期望输出） | `src/web/core/evaluation/dataset.ts:79` → `pageComponents/.../detail/DataListModals.tsx:78` | 工作台→评测→评测数据集详情→编辑数据弹窗→点击保存时调用 |
| `/core/evaluation/dataset/data/delete` | DELETE | 删除单条数据集数据 | `src/web/core/evaluation/dataset.ts:83` → `pageComponents/.../detail/DataList.tsx:92` | 工作台→评测→评测数据集详情→删除确认气泡→点击删除时调用 |
| `/core/evaluation/dataset/collection/update` | POST | 更新数据集配置（评测模型等） | `src/web/core/evaluation/dataset.ts:51` → `pageComponents/.../detail/DataListModals.tsx:83` | 工作台→评测→评测数据集详情→设置弹窗→确认保存时调用 |

## 数据追加

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/create` | POST | 手动新增单条数据到数据集 | `src/web/core/evaluation/dataset.ts:67` → `pageComponents/.../detail/ManuallyAddModal.tsx` | 工作台→评测→评测数据集详情→追加数据→手动录入→提交时调用 |
| `/core/evaluation/dataset/data/create/smartGenerate` | POST | AI 智能生成数据追加到数据集 | `src/web/core/evaluation/dataset.ts:72` → `pageComponents/.../IntelligentGeneration.tsx` | 工作台→评测→评测数据集详情→追加数据→AI生成→确认时调用 |
| `/core/evaluation/dataset/data/import` | POST | 文件导入数据到数据集 | `src/web/core/evaluation/dataset.ts:154` → `pageComponents/.../DataList.tsx`（路由跳转） | 工作台→评测→评测数据集详情→追加数据→文件导入→上传并确认时调用 |

## 质量评估

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/qualityAssessmentBatch` | POST | 批量质量评估全部数据 | `src/web/core/evaluation/dataset.ts:91` → `pageComponents/.../detail/DataListModals.tsx:70` | 工作台→评测→评测数据集详情→质量评估按钮→确认弹窗→开始评估时调用 |

## API 调用链追踪

### `/core/evaluation/dataset/collection/detail` 调用链

```
DataListModals
  ├── 触发: 设置弹窗打开 → 初始化评测模型
  ├── 参数: collectionId (从 Context 获取)
  └── 响应处理: 提取 evaluationModelId → 设置当前选中的评测模型
```

### `/core/evaluation/dataset/data/list` 调用链

```
DataList (DataListContent)
  ├── 触发: 页面加载 / 滚动到底部 / 搜索关键字变化 / 筛选状态变化
  ├── 参数: searchKey, status, qualityResult, collectionId, offset (分页)
  └── 响应处理: 更新 evaluationDataList 状态 → 同步到 Context → 渲染数据卡片列表
```

### `/core/evaluation/dataset/data/update` 调用链

```
DataListModals (handleSaveUpdateData)
  ├── 触发: 编辑弹窗中点击「保存」或「保存并下一条」
  ├── 参数: dataId, userInput, expectedOutput, qualityMetadata, qualityResult
  └── 响应处理: 成功 → 提示"更新成功" → 刷新列表；失败 → 显示错误提示
```

### `/core/evaluation/dataset/data/delete` 调用链

```
DataList (DataListContent → handleDeleteConfirmClick)
  ├── 触发: 删除确认气泡中点击「删除」
  ├── 参数: { dataId }
  └── 响应处理: 成功 → 提示"删除成功" → 刷新列表；失败 → 显示错误提示
```

### `/core/evaluation/dataset/collection/qualityAssessmentBatch` 调用链

```
DataListModals (handleQualityEvaluationConfirmWithRequest)
  ├── 触发: 质量评估确认弹窗中点击「开始评估」
  ├── 参数: { collectionId }
  └── 响应处理: 成功 → 提示"提交成功" → 刷新列表（数据状态变为排队中/评估中）；失败 → 显示错误提示
```

### `/core/evaluation/dataset/collection/update` 调用链

```
DataListModals (handleSettingsConfirm)
  ├── 触发: 设置弹窗中点击「确认」
  ├── 参数: { collectionId, evaluationModelId }
  └── 响应处理: 成功 → 提示"更新成功" → 设置弹窗关闭
```
