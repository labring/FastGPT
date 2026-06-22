---
capability_label: 团队应用
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:04:37Z"
parent_module: 对话首页
roles: [普通用户, 团队成员]
router_paths: []
---

# 团队应用 — API索引

## 说明

本模块未定义独立的 API 文件，所有 API 调用通过共享的 `@/web/core/app/api` 层发起。模块组件通过 `AppListContext` 间接调用这些 API。

## API 总览

### 应用列表查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/list` | POST | 分页获取团队应用列表 | `web/core/app/api.ts:23` → `dashboard/agent/context.tsx:119` | 团队应用→浏览→面板初始化时调用；团队应用→浏览→滚动加载更多时调用；团队应用→搜索→防抖后调用；团队应用→文件夹→进入时调用 |
| `/core/app/list` | POST | 不分页获取应用列表 | `web/core/app/api.ts:15` → `dashboard/agent/context.tsx:179` | 团队应用→文件夹→移动应用时获取可选目标文件夹列表 |

### 文件夹相关

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/detail` | GET | 获取文件夹详情 | `web/core/app/api.ts:45` → `dashboard/agent/context.tsx:148` | 团队应用→文件夹→进入文件夹时调用（获取当前文件夹权限信息） |

### 应用操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/update` | PUT | 更新应用信息（含移动） | `web/core/app/api.ts:50` → `dashboard/agent/context.tsx:157` | 团队应用→文件夹→移动应用到其他文件夹时调用 |
| `/core/app/del` | DELETE | 删除应用 | `web/core/app/api.ts:40` → `dashboard/agent/List.tsx:109` | 团队应用（间接）→应用卡片→删除确认后调用 |

## API 调用链追踪

### `POST /core/app/list` 调用链

```
AppListContextProvider (dashboard/agent/context.tsx:117-126)
  ├── 触发: 组件挂载 / parentId 变化 / searchKey 防抖后变化
  ├── 参数: { pageNum, pageSize, parentId, type: [...] , searchKey }
  ├── 分页: 首次 pageNum=1，滚动加载 pageNum 递增
  │    type 参数: /chat 路由下为 [folder, toolFolder, simple, workflow, workflowTool, chatAgent, assistant]
  └── 响应处理: myApps 列表更新 → 触发 List 组件重新渲染

AppListContextProvider.getAppFolderList (dashboard/agent/context.tsx:173-191)
  ├── 触发: 移动应用弹窗打开时
  ├── 参数: { parentId, type: folder }
  └── 响应处理: 过滤有写权限的文件夹，返回 id+name 用于目标选择
```

### `GET /core/app/detail` 调用链

```
AppListContextProvider (dashboard/agent/context.tsx:146-155)
  ├── 触发: parentId 变化时（进入文件夹）
  ├── 参数: parentId (当前文件夹 ID)
  ├── 条件: parentId 非空时才调用
  └── 响应处理: folderDetail 更新 → 用于权限判断和创建按钮显隐
```

### `PUT /core/app/update` 调用链

```
onMoveApp (dashboard/agent/context.tsx:164-171)
  ├── 触发: 移动应用弹窗确认时
  ├── 参数: { parentId: 目标文件夹ID }
  └── 响应处理: 刷新文件夹详情 + 面包屑路径 + 应用列表
```

### 文件夹路径 API

```
refetchPaths (dashboard/agent/context.tsx:138-144)
  ├── 触发: parentId 变化时
  ├── 参数: { sourceId: parentId, type: 'current' }
  └── 响应处理: paths 更新 → 渲染面包屑 FolderPath 组件
```
