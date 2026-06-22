---
capability_label: "文件导入"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: "评测数据集"
roles: ["具有评测创建权限的团队成员"]
router_paths:
  - "/dashboard/evaluation/dataset/fileImport"
---

# 文件导入 — API索引

## 数据集操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/create` | POST | 创建评测数据集 | `projects/app/src/web/core/evaluation/dataset.ts:32` → `projects/app/src/pages/dashboard/evaluation/dataset/fileImport.tsx:128` | 工作台→评测→评测数据集→文件导入→新建数据集并导入文件→提交时调用（新建模式） |

## 文件导入

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/import` | POST | 上传 CSV 文件批量导入评测数据 | `projects/app/src/web/core/evaluation/dataset.ts:124` → `projects/app/src/pages/dashboard/evaluation/dataset/fileImport.tsx:135` | 工作台→评测→评测数据集→文件导入→新建/追加模式→提交时调用 |

## API 调用链追踪

### `POST /core/evaluation/dataset/collection/create` 调用链

```
文件导入页面 (fileImport.tsx)
  ├── 触发: 用户在新建模式下点击"确认导入"按钮，且 collectionId 为空
  ├── 参数: { name: 用户输入的数据集名称 }
  ├── 响应处理: 返回新创建的 collectionId，作为下一步数据导入 API 的参数
  ├── 顺序: 串行——必须先完成创建，再使用返回的 collectionId 调用数据导入 API
  └── 错误处理: 名称重复/超出限额 → Promise reject → toast 显示错误信息

数据导入 API (import.ts)
  ├── 权限校验: authEvaluationDatasetCreate → 校验用户是否有创建权限
  ├── 配额检查: checkTeamEvalDatasetLimit → 校验团队数据集数量限额
  └── 唯一性: validateCollectionName → 校验数据集名称在团队内唯一
```

### `POST /core/evaluation/dataset/data/import` 调用链

```
文件导入页面 (fileImport.tsx)
  ├── 触发: 用户点击"确认导入"按钮
  ├── 参数:
  │   ├── FormData.file[]: 多文件（仅 .csv）
  │   └── FormData.data (JSON):
  │       ├── collectionId: 数据集 ID（新建模式由前置 API 返回，追加模式从 URL 参数获取）
  │       ├── enableQualityEvaluation: 是否开启自动评测（布尔值，来自 autoEvaluation 状态）
  │       └── evaluationModelId: 评测模型 ID（自动评测关闭时为 undefined）
  ├── 上传进度: 通过 onUploadProgress 回调更新百分比显示（percent 状态）
  ├── 超时配置: timeout=600000ms (10分钟)
  ├── Content-Type: multipart/form-data; charset=utf-8
  ├── 响应处理: 成功 → toast "文件导入成功" → 根据 scene 参数跳转
  └── 错误处理: Promise reject → toast 显示错误信息

数据导入 API (import.ts)
  ├── 文件接收: Multer 多文件解析
  ├── 文件校验:
  │   ├── 文件数 > 0
  │   └── 扩展名为 .csv
  ├── 权限校验（分支）:
  │   ├── collectionId 存在 → authEvaluationDatasetDataWrite（已有数据集写入权限）
  │   └── collectionId 为空 → authEvaluationDatasetCreate（创建权限）+ 参数校验
  ├── CSV 解析: parseCSVContent (Papa Parse)
  │   ├── 必填列: user_input, expected_output
  │   └── 可选列: actual_output, context, retrieval_context
  ├── 数据集创建（如新建）: createNewCollection
  ├── 数据插入: MongoEvalDatasetData.insertMany
  ├── 质量评测（如开启）:
  │   ├── checkEvalDatasetDataQualityQueueHealth → 检查消息队列健康
  │   └── addEvalDatasetDataQualityBulk → 批量添加质量评估任务
  ├── 审计日志: addAuditLog (IMPORT_EVALUATION_DATASET_DATA)
  └── 清理: removeFilesByPaths → 删除 Multer 临时文件
```
