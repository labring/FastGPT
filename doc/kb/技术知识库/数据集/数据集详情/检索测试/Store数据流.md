---
capability_label: 检索测试
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 数据集详情
roles: []
router_paths:
  - /dataset/detail?currentTab=test
---

# 检索测试 — Store 数据流

## Store 概览

| Store 文件 | Store ID | 用途 |
|-----------|---------|------|
| `projects/app/src/web/core/dataset/store/searchTest.ts` | `useSearchTestStore` | 管理数据集的检索测试历史记录，支持本地持久化 |

### useSearchTestStore — `projects/app/src/web/core/dataset/store/searchTest.ts`

#### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `datasetTestList` | `SearchTestStoreItemType[]` | 检索测试历史记录列表，最多保留 50 条 |

#### Actions

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `pushDatasetTestItem` | `data: SearchTestStoreItemType` | 将新的测试结果插入列表头部，超过 50 条时截断 | 无（纯 Store 操作） |
| `delDatasetTestItemById` | `id: string` | 按 ID 删除指定测试历史记录 | 无（纯 Store 操作） |
| `updateDatasetItemById` | `data: SearchTestStoreItemType` | 按 ID 更新指定测试历史记录 | 无（纯 Store 操作） |

**SearchTestStoreItemType 结构**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识（nanoid） |
| `datasetId` | `string` | 所属数据集 ID |
| `text` | `string` | 测试输入文本 |
| `time` | `Date` | 测试时间 |
| `duration` | `string` | 检索耗时 |
| `results` | `SearchDataResponseItemType[]` | 检索结果列表 |
| `searchMode` | `DatasetSearchModeEnum` | 使用的搜索模式 |
| `limit` | `number` | 返回条数上限 |
| `usingReRank` | `boolean` | 是否使用 ReRank |
| `similarity` | `number` | 相似度阈值 |
| `queryExtensionModel` | `string?` | 问题扩展使用的模型 ID |

#### 持久化配置

- **存储方式**：Zustand persist（localStorage）
- **存储 Key**：`searchTestStore`
- **持久化字段**：仅 `datasetTestList`（通过 `partialize` 选择性持久化）

## 数据流向

### 检索测试执行 → 结果存储流程

```
Test 组件                    useSearchTestStore           API                          Backend
   │                              │                       │                              │
   │  用户点击"测试"按钮           │                       │                              │
   │  调用 postSearchText()       │                       │                              │
   ├─────────────────────────────────────────────────────►│                              │
   │                              │                       │  POST /core/dataset/          │
   │                              │                       │  searchTest                  │
   │                              │                       ├─────────────────────────────►│
   │                              │                       │                              │
   │                              │                       │  ◄── SearchDatasetTestResponse
   │                              │                       │◄─────────────────────────────┤
   │  onSuccess(res)              │                       │                              │
   │  构造 SearchTestStoreItemType│                       │                              │
   │  pushDatasetTestItem(item)   │                       │                              │
   ├─────────────────────────────►│                       │                              │
   │                              │  [data, ...list]      │                              │
   │                              │  .slice(0, 50)        │                              │
   │                              │  持久化到 localStorage │                              │
   │  setDatasetTestItem(item)    │                       │                              │
   │  UI 更新：右侧展示结果        │                       │                              │
```

### 历史记录读取 → 展示流程

```
TestHistories 组件            useSearchTestStore           localStorage
   │                              │                          │
   │  组件挂载                     │                          │
   │  datasetTestList 读取         │                          │
   ├─────────────────────────────►│                          │
   │                              │  从 localStorage 恢复     │
   │                              ├─────────────────────────►│
   │                              │◄─────────────────────────┤
   │  filter(datasetId)           │                          │
   │  testHistories (useMemo)     │                          │
   │  UI 渲染历史列表              │                          │
```

## 组件间通信模式

| 通信模式 | 场景 | 涉及组件 |
|---------|------|---------|
| 父子 Props | Test 组件传递 datasetId/testItem 到子组件 | `Test` → `TestHistories`、`TestResults`、`TestResultDatabase` |
| Store 共享状态 | 检索历史记录的读写 | `Test` ↔ `TestHistories`（通过 `useSearchTestStore`） |
| Context | 读取数据集详情（类型、向量模型等） | `Test` → `DatasetPageContext` |
| Context | 读取系统默认模型配置 | `Test` → `useSystemStore` |
| 回调 Props | 子组件通知父组件更新当前选中项 | `TestHistories` → `Test`（通过 `setDatasetTestItem`） |
