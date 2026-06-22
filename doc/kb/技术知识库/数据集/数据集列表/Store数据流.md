---
capability_label: 数据集列表
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T10:37:00.000Z"
parent_module: 数据集
roles: ["管理员", "协作者", "只读用户"]
router_paths: ["/dataset/list"]
---

# 数据集列表 — Store 数据流

## Store 概览

数据集列表模块涉及两个状态管理层：全局 Zustand Store（`useDatasetStore`）和页面级 React Context（`DatasetsContext`）。页面实际使用 Context 作为主要数据源。

| Store 文件 | Store ID | 用途 |
|-----------|---------|------|
| `projects/app/src/web/core/dataset/store/dataset.ts` | `useDatasetStore` | 全局数据集列表缓存（Zustand + persist） |
| `projects/app/src/pageComponents/dataset/list/context.tsx` | `DatasetsContext` | 页面级数据集列表状态管理（React Context） |

---

## `DatasetsContext` — `projects/app/src/pageComponents/dataset/list/context.tsx`

数据集列表页面的核心状态管理，通过 React Context Provider 模式向子组件提供数据和操作方法。

### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `myDatasets` | `DatasetListItemType[]` | 当前页面展示的数据集/文件夹列表 |
| `paths` | `ParentTreePathItemType[]` | 从根目录到当前父文件夹的面包屑路径 |
| `folderDetail` | `DatasetItemType \| undefined` | 当前文件夹（parentId 指向的文件夹）的详细信息，含权限、名称、图标 |
| `isFetchingDatasets` | `boolean` | 数据集列表是否正在加载中 |
| `hasMore` | `boolean` | 是否还有更多数据可加载（分页） |
| `searchKey` | `string` | 当前搜索关键词 |
| `editedDataset` | `EditResourceInfoFormType \| undefined` | 当前正在编辑的数据集信息（由顶部编辑按钮触发） |
| `moveDatasetId` | `string` | 当前待移动的数据集ID（菜单触发移动流程） |

### Actions

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `loadMyDatasets` | — | 加载数据集列表，设置搜索关键词和时间戳参数 | `POST /core/dataset/list` |
| `refetchPaths` | — | 重新获取面包屑路径 | `GET /core/dataset/paths` |
| `refetchFolderDetail` | — | 重新获取当前文件夹详情（权限、名称等） | `GET /core/dataset/detail` |
| `onUpdateDataset` | `UpdateDatasetBody` | 更新数据集信息（名称、描述、头像、父目录） | `PUT /core/dataset/update` |
| `onDelDataset` | `id: string` | 删除数据集 | `DELETE /core/dataset/delete` |
| `setSearchKey` | `string` | 设置搜索关键词 | —（触发列表重新加载） |
| `setEditedDataset` | `data?: EditResourceInfoFormType` | 设置待编辑的数据集信息 | — |
| `setMoveDatasetId` | `id: string` | 设置待移动的数据集ID | — |
| `sentinelCallbackRef` | `HTMLDivElement \| null` | 无限滚动哨兵元素的回调引用（IntersectionObserver） | — |

---

## `useDatasetStore` — `projects/app/src/web/core/dataset/store/dataset.ts`

全局 Zustand Store，通过 `persist` 中间件保持状态，提供跨页面的数据集列表缓存。

### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `myDatasets` | `DatasetListItemType[]` | 全局缓存的数据集列表 |

### Actions

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `loadMyDatasets` | `parentId?: string` | 从 API 加载数据集列表并更新 store | `POST /core/dataset/list` |

> 注意：本模块页面实际使用 `DatasetsContext` 而非 `useDatasetStore`。`useDatasetStore` 主要用于其他需要快速获取数据集列表的模块。

---

## 数据流向

### 列表加载流程

```
Page Component (Dataset)                 Context (DatasetsContext)        API Layer           Backend
     │                                        │                           │                    │
     │  useContextSelector(myDatasets...)      │                           │                    │
     ├───────────────────────────────────────►│                           │                    │
     │                                        │  POST /core/dataset/list  │                    │
     │                                        ├──────────────────────────►│                    │
     │                                        │                           │  ── request ──►   │
     │                                        │                           │  ◄─ response ──   │
     │                                        │  myDatasets[] + stats     │                    │
     │                                        │◄──────────────────────────┤                    │
     │                                        │                           │                    │
     │  re-render with new myDatasets         │                           │                    │
     │◄───────────────────────────────────────┤                           │                    │
```

### 文件夹切换流程

```
User clicks folder card
     │
     ├── router.push({ query: { parentId: newId } })
     │
     ├── setSearchKey('')                    ← clear search
     │
     ├── loadMyDatasets()                    ← POST /core/dataset/list
     │
     ├── refetchPaths()                      ← GET /core/dataset/paths
     │
     └── refetchFolderDetail()               ← GET /core/dataset/detail
          │
          └── UI updates: breadcrumb, operation buttons visibility, card grid
```

### 新建/编辑/删除后的刷新流程

```
Action: Create/Edit/Delete Dataset
     │
     ├── loadMyDatasets()                    ← refresh list
     └── refetchPaths()                      ← refresh breadcrumb (for create/delete)
```

### 滚动加载更多流程

```
IntersectionObserver fires (sentinelCallbackRef enters viewport)
     │
     ├── check: hasMore && !isFetchingDatasets
     │    ├── true → loadMyDatasets() with next page
     │    │          ├── pageNum++
     │    │          └── append new data to myDatasets[]
     │    └── false → skip
     │
     └── Spinner visible at list bottom until response
```

---

## 组件间通信模式

| 通信模式 | 场景 | 涉及组件 |
|---------|------|---------|
| React Context (useContextSelector) | 页面级状态共享：列表数据、搜索、路径、文件夹详情 | `Dataset` → `NewList`、`NewDatasetCard`、`List` |
| Props 传递 | 操作回调：编辑、权限、导出、删除 | `NewList` → `NewDatasetCard`（通过 Props 传递回调函数和数据集对象） |
| URL 路由参数 | 文件夹导航：`parentId` 作为查询参数 | `Dataset` 通过 `router.query.parentId` 获取当前文件夹ID |
| 动态导入 (dynamic import) | 弹窗组件按需加载 | `index.tsx` → `EditFolderModal`、`CreateModal`、`ConfigPerModal` |
| 全局 Store 订阅 | 系统配置、用户信息 | `useSystemStore`（feConfigs）、`useUserStore`（userInfo） |

本模块未使用跨组件的事件总线（EventBus/mitt）或依赖注入（Provide/Inject）。
