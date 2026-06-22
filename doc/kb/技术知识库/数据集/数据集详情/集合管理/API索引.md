---
capability_label: 集合管理
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:39:35Z"
parent_module: 数据集详情
roles:
  - owner
  - collaborator
  - viewer
router_paths:
  - /dataset/detail?currentTab=collectionCard
---

# 集合管理 — API索引

## 集合查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/listV2` | POST | 获取数据集集合分页列表 | `api/collection.ts:39` → `Context.tsx:146` | 集合管理→集合列表浏览→首次加载/翻页/搜索/筛选/排序时调用；集合管理→集合列表浏览→处理中集合轮询刷新时调用（10s 间隔） |

## 集合更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/update` | POST | 更新集合信息（名称、父目录、启用状态、自动同步等） | `api/collection.ts:45` → `index.tsx:354` | 集合管理→单个集合操作→重命名时调用；集合管理→单个集合操作→移动时调用；集合管理→单个集合操作→启用/禁用开关切换时调用；集合管理→单个集合操作→同步设置时调用 |

## 集合删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/delete` | POST | 删除集合（支持批量） | `api/collection.ts:47` → `index.tsx:373` | 集合管理→单个集合操作→删除确认后调用；集合管理→批量操作→批量删除确认后调用 |

## 集合同步

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/sync` | POST | 同步链接集合 | `api/collection.ts:49` → `index.tsx:409` | 集合管理→单个集合操作→链接集合同步时调用；集合管理→批量操作→批量同步时调用 |

## 集合源读取

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/read` | POST | 获取集合源文件 URL | `api/collection.ts:158` → `index.tsx:317` | 集合管理→单个集合操作→查看/下载源文件时调用 |

## 批量操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/batchDownload` | POST | 批量下载集合（返回 ZIP Blob） | `api/collection.ts:162` → `index.tsx:389` | 集合管理→批量操作→批量下载时调用 |

## 重复检查

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/checkDuplicate` | POST | 检查移动目标路径是否有同名文件 | `api.ts` → `index.tsx:1282` | 集合管理→单个集合操作→移动确认后检查重名时调用 |

## 错误重试

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/training/retryErrorCollections` | PUT | 重试所有异常集合的训练 | `api.ts:467` → `index.tsx:434` | 集合管理→集合列表浏览→点击「全部重试」时调用 |

## 权限管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/collaborator/list` | GET | 获取集合协作者列表 | `api/collaborator.ts` → `index.tsx:1364` | 集合管理→单个集合操作→打开权限配置弹窗时调用 |
| `/core/dataset/collection/collaborator/update` | POST | 更新集合协作者 | `api/collaborator.ts:26` → `index.tsx:1367` | 集合管理→单个集合操作→权限配置弹窗中修改协作者时调用 |
| `/core/dataset/collection/collaborator/delete` | DELETE | 删除集合协作者 | `api/collaborator.ts` → `index.tsx:1372` | 集合管理→单个集合操作→权限配置弹窗中移除协作者时调用 |
| `/core/dataset/collection/resumeInheritPermission` | POST | 恢复继承父文件夹权限 | `api/collaborator.ts` → `index.tsx:1351` | 集合管理→单个集合操作→权限配置弹窗中恢复继承时调用 |
| `/core/dataset/collection/changeOwner` | POST | 变更集合所有者 | `api/collaborator.ts` → `index.tsx:1356` | 集合管理→单个集合操作→权限配置弹窗中变更所有者时调用 |

## 标签管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/dataset/tag/addToCollections` | POST | 批量给集合添加标签 | `api/collection.ts:140` → `BatchSetTagsModal.tsx` | 集合管理→批量操作→批量设置标签时调用 |
| `/proApi/core/dataset/tag/getAllTags` | GET | 获取数据集所有标签 | `api/collection.ts:154` → 父级 Context | 集合管理→集合列表浏览→页面初始加载时调用 |
