---
capability_label: 集合管理
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T10:39:35Z"
parent_module: 数据集详情
roles:
  - owner
  - collaborator
  - viewer
router_paths:
  - /dataset/detail?currentTab=collectionCard
---

# 集合管理 — Store数据流

## 状态管理架构

集合管理模块使用 **React Context + useContextSelector** 模式进行状态管理，核心 Context 为 `CollectionPageContext`。

### Context 层次结构

```
DatasetPageContextProvider (数据集页面级)
  └── CollectionPageContextProvider (集合管理级，定义在 ../CollectionCard/Context.tsx)
        └── CollectionCard (集合管理主组件)
              ├── StatusFilter
              ├── TagFilter
              ├── DatabaseListTable (数据库模式)
              └── ... (其他子组件和弹窗)
```

## CollectionPageContext 状态定义

### 集合列表数据

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `collections` | `DatasetCollectionsListItemType[]` | API 返回的原始集合列表 | `usePagination(getDatasetCollections)` |
| `displayedCollections` | `DatasetCollectionsListItemType[]` | 经过标签值过滤后的展示列表 | `useMemo` 计算：collections 按 filterTagValues 前端过滤 |
| `total` | `number` | 集合总数 | `usePagination` 返回 |
| `isGetting` | `boolean` | 是否正在获取数据 | `usePagination` 返回 |

### 分页参数

| 字段 | 类型 | 说明 |
|------|------|------|
| `pageNum` | `number` | 当前页码 |
| `pageSize` | `number` | 每页条数（默认 20） |
| `Pagination` | `() => JSX.Element` | 分页组件渲染函数 |

### 筛选与排序状态

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `searchText` | `string` | `''` | 搜索文本（与父组件 Header 共享） |
| `filterTags` | `string[]` | `[]` | 标签 ID 筛选列表 |
| `filterTagValues` | `Record<string, string[]>` | `{}` | 标签值筛选（tagId → values 映射），用于前端过滤 displayedCollections |
| `statusFilter` | `CollectionStatusEnum \| undefined` | `undefined` | 集合状态筛选 |
| `sortBy` | `'name' \| 'updateTime' \| 'createTime' \| 'dataAmount' \| null` | `null` | 排序字段 |
| `sortOrder` | `'asc' \| 'desc'` | `'asc'` | 排序方向 |

### 其他状态

| 字段 | 类型 | 说明 |
|------|------|------|
| `hasDatabaseConfig` | `boolean` | 数据集是否有数据库配置（判断 database 类型） |
| `hasTrainingData` | `boolean` | 是否存在训练中的集合（collection.trainingAmount > 0） |
| `scrollContainerRef` | `RefObject<HTMLDivElement>` | 表格滚动容器引用 |

### 操作函数

| 函数 | 说明 |
|------|------|
| `getData(pageNum)` | 获取指定页的集合数据，同时触发 `refetchDatasetTraining` 刷新训练状态 |
| `handleOpenConfigPage(mode, databaseName, activeStep)` | 跳转到数据集导入 Tab 管理数据库表结构 |
| `openDatasetSyncConfirm()` | 触发数据集级同步确认（用于 websiteDataset） |
| `onOpenWebsiteModal()` | 打开网站数据集配置弹窗 |

## 数据流转

### 集合列表加载流程

```
用户进入页面 / 切换 Tab
  → CollectionPageContextProvider 挂载
    → usePagination(getDatasetCollections, { params: { datasetId, parentId, ... }, refreshDeps: [...] })
      → 调用 POST /core/dataset/collection/listV2
        → 返回 { list: DatasetCollectionsListItemType[], total: number }
          → 更新 collections + total + Pagination
            → useMemo 计算 displayedCollections（按 filterTagValues 前端过滤）
              → CollectionCard 通过 useContextSelector 读取并渲染表格
```

### 筛选/排序触发刷新流程

```
用户操作（搜索/状态筛选/标签筛选/排序）
  → 更新 Context 中的对应状态（setSearchText / setStatusFilter / setSortBy 等）
    → refreshDeps 变化触发 usePagination 重新请求
      → 调用 POST /core/dataset/collection/listV2（含更新后的参数）
        → 返回新数据
          → 更新 collections + displayedCollections
            → 表格重新渲染
```

### 轮询刷新流程

```
CollectionCard 中 useRequest 监听:
  - hasProcessingCollections (queued/parsing/indexing 状态) → 10s 间隔轮询
  - hasTrainingData && datasetDetail.status === 'active' → 10s 间隔轮询
    → 调用 getData(pageNum)（isPollingRef = true 静默模式）
      → 更新 collections 但不显示加载遮罩
        → 静默更新状态标签和进度
```

### 标签值过滤流程（前端过滤）

```
filterTagValues = { tagId1: ['valueA'], tagId2: ['valueB'] }
  → useMemo 遍历 collections
    → 每个 collection 的 tags 对象数组
      → 检查是否满足 filterTagValues 中任一条件
        → 满足 → 保留
        → 不满足 → 过滤掉
  → 输出 displayedCollections
```

## 消费关系

CollectionPageContext 被以下组件消费（通过 `useContextSelector`）：

| 消费组件 | 消费的字段 |
|---------|-----------|
| `CollectionCard (index.tsx)` | collections, displayedCollections, Pagination, total, getData, isGetting, pageNum, pageSize, searchText, filterTags, statusFilter, sortBy, sortOrder, scrollContainerRef, hasTrainingData, handleOpenConfigPage |
| `Header.tsx` (父组件) | searchText, setSearchText, filterTags, setFilterTags, openDatasetSyncConfirm, onOpenWebsiteModal, hasDatabaseConfig, handleOpenConfigPage |
| `HeaderTagPopOver.tsx` | filterTags, filterTagValues, setFilterTags, setFilterTagValues |
| `DatabaseListTable.tsx` | formatCollections, total, onUpdateCollection 等 |
| `EmptyCollectionTip.tsx` | （空状态提示） |
