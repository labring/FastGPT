---
capability_label: 结构化数据卡片
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 数据集详情
roles: []
router_paths:
  - /dataset/detail?currentTab=fileDataCard
---

# 结构化数据卡片 — API索引

## 集合查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/detail` | GET | 获取集合详细信息 | `api.ts:286` → `FileDataCard.tsx:40` | 数据集→数据集详情→结构化数据预览→加载时调用（获取集合基本信息用于面包屑展示） |

### `/core/dataset/collection/detail` 调用链

```
FileDataCard
  ├── 触发: 页面加载时自动请求
  ├── 参数: id={collectionId}（来自路由 query）
  └── 响应处理: 提取 sourceName 显示在返回按钮旁；失败时跳转回数据集详情页
```

## 数据预览

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/database/preview` | GET | 获取结构化集合的预览数据 | `api.ts:577` → `FileDataCard.tsx:53` | 数据集→数据集详情→结构化数据预览→加载时调用（获取列结构和前 20 行数据） |

### `/core/dataset/database/preview` 调用链

```
FileDataCard
  ├── 触发: 页面加载时自动请求
  ├── 参数: collectionId={collectionId}（来自路由 query）
  └── 响应处理: 提取 cols（表头列名）、data（数据行）、columnCount、rowCount；
      取前 20 行渲染表格；失败时跳转回数据集详情页
```
