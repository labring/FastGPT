---
capability_label: 检索测试
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 数据集详情
roles: []
router_paths:
  - /dataset/detail?currentTab=test
---

# 检索测试 — API索引

## 检索测试

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/searchTest` | POST | 执行数据集文本检索测试 | `projects/app/src/web/core/dataset/api.ts:278` → `projects/app/src/pageComponents/dataset/detail/Test.tsx:112` | 数据集详情→检索测试Tab→输入文本→点击测试按钮时调用 |
| `/core/dataset/database/searchTest` | POST | 执行数据库数据集检索测试（自然语言转 SQL 查询） | `projects/app/src/web/core/dataset/api.ts:491` → `projects/app/src/pageComponents/dataset/detail/Test.tsx:143` | 数据集详情→检索测试Tab（数据库类型数据集）→输入查询→点击测试按钮时调用 |

## API 调用链追踪

### `/core/dataset/searchTest` 调用链

```
Test 组件 (Test.tsx:110)
  ├── 触发: 用户输入测试文本后点击"测试"按钮（非数据库类型数据集）
  ├── 参数: { datasetId, text, searchMode, embeddingWeight, embeddingModelId, usingReRank, rerankModelId, rerankMethod, rerankWeight, similarity, limit, datasetSearchUsingExtensionQuery, datasetSearchExtensionModelId, datasetSearchExtensionBg }
  └── 响应处理:
        ├── 成功: 构造 SearchTestStoreItemType 对象 → pushDatasetTestItem 存入 Store → setDatasetTestItem 更新当前选中项 → 右侧面板展示结果列表
        └── 空结果: toast 警告提示 "未检索到相关数据"
```

### `/core/dataset/database/searchTest` 调用链

```
Test 组件 (Test.tsx:141)
  ├── 触发: 用户输入自然语言查询后点击"测试"按钮（数据库类型数据集）
  ├── 参数: { datasetId, query, modelId }
  └── 响应处理:
        ├── 成功: 构造 SearchTestStoreItemType 对象（searchMode 固定为 database）→ pushDatasetTestItem 存入 Store → setDatasetTestItem 更新当前选中项 → 右侧展示 SQL 语句和解析答案
        └── 空结果（无 answer）: toast 警告提示 "未检索到相关数据"
```

## 说明

本模块不包含独立的 API 定义文件。API 函数定义在共享的 `@/web/core/dataset/api` 模块中。本模块（检索测试 Tab）通过 import 直接调用这些共享 API 函数，并在组件内部处理响应逻辑。
