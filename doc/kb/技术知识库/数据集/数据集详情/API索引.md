---
capability_label: "数据集详情"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:40:00.000Z"
parent_module: "数据集"
roles: ["所有用户", "管理员"]
router_paths: ["/dataset/detail"]
---

# 数据集详情 — API 索引

> 本文档覆盖数据集详情页面的公共 API 层（页面容器级和 NavBar 中调用的 API）。各 Tab 子能力的 API 详见对应子目录的 API 索引。

## 数据集信息

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/detail` | GET | 获取数据集详情（含权限信息） | `web/core/dataset/api.ts` → `datasetPageContext.tsx:107` | 数据集详情→页面加载→初始化时调用；同步/等待状态→每10秒轮询时调用 |
| `/core/dataset/update` | PUT | 更新数据集配置 | `web/core/dataset/api.ts` → `datasetPageContext.tsx:116` | 数据集详情→配置Tab→保存时调用（各子Tab也可能调用） |

## 数据集路径

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/paths` | POST | 获取数据集父级路径（面包屑） | `web/core/dataset/api.ts` → `datasetPageContext.tsx:195` | 数据集详情→页面加载→初始化时调用；数据集移动后→刷新路径时调用 |

## 训练队列

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/training/queue` | GET | 获取训练队列状态 | `web/core/dataset/api/training.ts` → `datasetPageContext.tsx:190` | 数据集详情→页面加载→初始化时调用（用于判断是否有错误/训练中/重建中的集合） |

## 集合路径

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/paths` | GET | 获取集合在文件夹中的路径 | `web/core/dataset/api/collection.ts:41` → `NavBar.tsx:51,57` | 数据集详情→NavBar→集合管理Tab或数据卡片Tab→加载面包屑时调用 |

## 集合源文件读取

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/read` | POST | 读取集合源文件/下载 | `web/core/dataset/api/collection.ts:158` → `NavBar.tsx:119` | 数据集详情→数据卡片Tab→NavBar点击"查看原文/下载文件"按钮时调用 |

### `/core/dataset/collection/read` 调用链

```
NavBar
  ├── 触发: 用户在数据卡片/文件卡片 Tab 点击 NavBar 右侧的"查看原文"/"下载文件"/"查看图片"按钮
  ├── 参数: { collectionId: string }
  ├── 响应处理: value 为空 → toast "文件未找到"
  │               value 以 http 开头 → window.open(value, '_blank')
  │               value 以 / 开头 → window.open(location.origin + value, '_blank')
  │               API 数据集 → 拼接 baseUrl + value 后 window.open
  └── 按钮可见条件: currentTab ∈ {dataCard, fileDataCard} 且 collection 已加载且 sourceLabel 非空

CollectionCard (RefinedCollectionCard)
  ├── 触发: 集合列表中点击某个集合的"读取源"操作
  ├── 参数: { collectionId: string }
  └── 响应处理: 同上（详见子文档）
```

## 标签（仅 Plus 版）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/dataset/tag/getAllTags` | GET | 获取数据集全部标签 | `web/core/dataset/api/collection.ts:154` → `datasetPageContext.tsx:145` | 数据集详情→页面加载→Plus版→初始化标签数据时调用 |
| `/proApi/core/dataset/tag/list` | POST | 搜索标签（分页） | `web/core/dataset/api/collection.ts:151` → `datasetPageContext.tsx:157` | 数据集详情→页面加载→Plus版→搜索标签时调用（300ms 节流） |
| `/proApi/core/dataset/tag/create` | POST | 创建新标签 | `web/core/dataset/api/collection.ts:138` → `datasetPageContext.tsx:172` | 数据集详情→集合管理→创建新标签时调用 |

## API 分组汇总

| 分组 | API 数量 | 说明 |
|------|---------|------|
| 查询/列表 | 5 | 数据集详情、路径、训练队列、集合路径、全部标签 |
| 更新 | 1 | 更新数据集配置 |
| 文件操作 | 1 | 读取/下载集合源文件 |
| 标签管理 | 2 | 搜索标签、创建标签 |

> 各 Tab 子能力的 API（如集合 CRUD、数据分片操作、导入、检索测试、同义词等）详见各子目录的 API 索引文档。
