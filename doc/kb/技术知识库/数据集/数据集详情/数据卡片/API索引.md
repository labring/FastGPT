---
capability_label: 数据卡片
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:39:36.000Z"
parent_module: 数据集详情
roles:
  - 管理员/编辑者
  - 只读用户
router_paths:
  - /dataset/detail?currentTab=dataCard
---

# 数据卡片 — API索引

> 反向索引：API → 业务场景。标注每个 API 的调用位置和触发时机。

---

## 数据查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/data/v2/list` | POST | 获取数据分页列表 | `@/web/core/dataset/api.ts` → `RefinedDataCard/index.tsx:281`（usePagination 内部） | 数据卡片→浏览数据列表→首次/翻页/搜索/轮询时调用 |
| `/core/dataset/data/detail` | GET | 获取单条数据详情 | `@/web/core/dataset/api.ts` → `RefinedDataCard/index.tsx:151`（fetchActiveDataDetail）；`EditContentModal.tsx:60`（编辑模式获取当前数据） | 数据卡片→浏览数据列表→选中卡片时调用；数据卡片→编辑数据→打开弹窗时调用 |
| `/core/dataset/data/getindex` | POST | 获取数据在集合中的索引位置 | `@/web/core/dataset/api.ts` → `RefinedDataCard/index.tsx:86`（useEffect 计算初始分页） | 数据卡片→activeId 定位→确定目标数据所在分页时调用 |

## 数据操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/data/update` | PUT | 更新单条数据 | `@/web/core/dataset/api.ts` → `RefinedDataCard/index.tsx:214`（saveNewIndex）、`RefinedDataCard/index.tsx:432`（editIndex）、`RefinedDataCard/index.tsx:466`（deleteIndex）；`EditContentModal.tsx:83`（onUpdateData） | 数据卡片→新增索引/编辑索引/删除索引→提交时调用；数据卡片→编辑数据→提交时调用 |
| `/core/dataset/data/insertData` | POST | 新增一条数据 | `@/web/core/dataset/api.ts` → `EditContentModal.tsx:108`（onInsertData） | 数据卡片→新增数据→提交时调用 |
| `/core/dataset/data/delete` | DELETE | 删除单条数据 | `@/web/core/dataset/api.ts` → `RefinedDataCard/index.tsx:406`（onDeleteOneData） | 数据卡片→删除数据→确认时调用 |

## 集合信息

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/detail` | GET | 获取集合详情 | `@/web/core/dataset/api.ts` → `RefinedDataCard/index.tsx:133`（useRequest 自动触发） | 数据卡片→页面初始化→加载集合信息（训练类型、errorCount 等）时调用 |

---

## API 调用链追踪

### `/core/dataset/data/v2/list` 调用链

```
RefinedDataCard (usePagination 封装)
  ├── 触发: 页面首次加载、翻页、切换每页条数、搜索防抖结束、训练状态轮询
  ├── 参数: { collectionId, searchText, pageNum, pageSize }
  └── 响应处理: 更新 datasetDataList 和 total → 渲染卡片列表和分页器
```

### `/core/dataset/data/detail` 调用链

```
RefinedDataCard (fetchActiveDataDetail)
  ├── 触发: 点击数据卡片激活；训练状态变更后刷新详情
  ├── 参数: { id: dataId }
  └── 响应处理: 设置 activeDataDetail → 右侧面板渲染索引列表（过滤 default 类型）

EditContentModal (编辑模式自动加载)
  ├── 触发: 编辑弹窗打开
  ├── 参数: { id: dataId }
  └── 响应处理: 获取 currentData（含 indexes），用于提交时保留现有索引
```

### `/core/dataset/data/getindex` 调用链

```
RefinedDataCard (useEffect 计算初始分页)
  ├── 触发: activeId 存在时自动执行
  ├── 参数: { dataId, collectionId, datasetId }
  └── 响应处理: 获取 index → 计算 pageNum → 触发对应页数据加载；index === -1 时 Toast 警告并加载第一页
```

### `/core/dataset/data/update` 调用链

```
RefinedDataCard (saveNewIndex)
  ├── 触发: 新增自定义索引后保存
  ├── 参数: { dataId, q, a, indexes: [新增索引项] }
  └── 响应处理: 成功后重新加载 activeDataDetail

RefinedDataCard (editIndex)
  ├── 触发: 编辑已有索引后保存
  ├── 参数: { dataId, q, a, indexes: [更新后索引列表] }
  └── 响应处理: 成功后重新加载 activeDataDetail

RefinedDataCard (deleteIndex)
  ├── 触发: 删除已有索引后保存
  ├── 参数: { dataId, q, a, indexes: [移除目标索引后的列表] }
  └── 响应处理: 成功后重新加载 activeDataDetail

EditContentModal (onUpdateData)
  ├── 触发: 编辑数据弹窗提交
  ├── 参数: { dataId, q, a, indexes: 保留现有索引 }
  └── 响应处理: 成功后 Toast → 关闭弹窗 → 本地更新列表 → 若编辑的为当前激活卡片则刷新详情
```

### `/core/dataset/data/insertData` 调用链

```
EditContentModal (onInsertData)
  ├── 触发: 新增数据弹窗提交
  ├── 参数: { collectionId, q, a }
  └── 响应处理: 成功后 Toast "添加数据成功，索引为 N" → 关闭弹窗 → 刷新数据列表
```

### `/core/dataset/data/delete` 调用链

```
RefinedDataCard (onDeleteOneData)
  ├── 触发: 删除确认弹窗点击确认
  ├── 参数: { id: dataId }
  └── 响应处理: 成功后本地过滤移除该项 → 刷新列表数据 → Toast "删除成功"
```

### `/core/dataset/collection/detail` 调用链

```
RefinedDataCard (useRequest 自动触发)
  ├── 触发: collectionId 变化时自动加载
  ├── 参数: { id: collectionId }
  └── 响应处理: 获取 collection（含 trainingType、errorCount）→ 决定页面显示（FAQ/普通模式区分、异常标签显示）
```
