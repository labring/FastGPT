---
capability_label: 工具管理
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:15:00.000Z"
parent_module: 工作台
roles: [团队所有者, 管理员, 编辑者, 只读成员]
router_paths: [/dashboard/tool]
---

# 工具管理 — API索引

## 工具列表查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/list | POST | 分页获取工具列表 | web/core/app/api.ts:23 → pageComponents/dashboard/agent/context.tsx:119 | 工具管理→查看工具列表→加载时调用；工具管理→查看工具列表→翻页时调用；工具管理→搜索工具→输入防抖后调用；工具管理→切换类型筛选→筛选变更时调用 |

## 文件夹操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/folder/create | POST | 创建新文件夹 | web/core/app/api/app.ts:14 → pages/dashboard/tool/index.tsx:80 | 工具管理→创建文件夹→提交创建弹窗时调用 |
| /core/app/folder/path | GET | 获取文件夹面包屑路径 | web/core/app/api/app.ts:17 → pageComponents/dashboard/agent/context.tsx:139 | 工具管理→导航到文件夹→进入文件夹时调用；工具管理→创建/编辑/移动→操作完成后刷新面包屑时调用 |

## 工具/文件夹详情与更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/detail | GET | 获取应用/工具/文件夹详情 | web/core/app/api.ts:45 → pageComponents/dashboard/agent/context.tsx:148 | 工具管理→查看工具列表→进入文件夹时获取文件夹详情；工具管理→编辑/移动/删除→操作完成后刷新详情时调用 |
| /core/app/update | PUT | 更新应用/工具/文件夹信息 | web/core/app/api.ts:50 → pageComponents/dashboard/agent/context.tsx:158 | 工具管理→编辑工具/文件夹信息→提交编辑弹窗时调用；工具管理→移动工具/文件夹→确认移动时调用 |

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/del | DELETE | 删除应用/工具/文件夹 | web/core/app/api.ts:40 → pages/dashboard/tool/index.tsx:86 | 工具管理→删除工具/文件夹→确认删除弹窗时调用 |

## 复制

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/copy | POST | 复制工具 | web/core/app/api/app.ts:27 → pageComponents/dashboard/agent/List.tsx:130 | 工具管理→复制工具→确认复制弹窗时调用 |

## 权限管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/resumeInheritPermission | GET | 恢复权限继承 | web/core/app/api.ts:62 → pages/dashboard/tool/index.tsx:284 | 工具管理→管理协作者权限→点击"恢复继承"时调用 |
| /proApi/core/app/collaborator/list | POST | 获取协作者列表 | web/core/app/api/collaborator.ts:8 → components/common/folder/SlideCard.tsx:303 | 工具管理→管理协作者权限→打开协作者面板时调用 |
| /proApi/core/app/collaborator/update | POST | 更新协作者权限 | web/core/app/api/collaborator.ts:11 → components/common/folder/SlideCard.tsx:306 | 工具管理→管理协作者权限→添加/修改协作者权限时调用 |
| /proApi/core/app/collaborator/delete | DELETE | 删除协作者 | web/core/app/api/collaborator.ts:14 → components/common/folder/SlideCard.tsx:312 | 工具管理→管理协作者权限→移除协作者时调用 |

## 文件上传

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /common/file/presignAvatarPostUrl | POST | 获取头像上传预签名 URL | web/common/file/api.ts:8 → pages/dashboard/tool/index.tsx:327（传递给 EditFolderModal） | 工具管理→创建/编辑文件夹→上传文件夹头像时调用 |

## 工具创建相关 API

工具创建不在本模块直接发起单独的创建 API，而是通过 `ToolModal` 组件内的以下接口完成：

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/create（通过 postCreateApp） | POST | 创建工作流工具 | web/core/app/api.ts → pages/dashboard/create/ToolModal.tsx:160 | 工具管理→创建工具→选择工作流工具→确认创建时调用 |
| /core/app/httpTool/create（通过 postCreateHttpTools） | POST | 创建 HTTP 工具集 | web/core/app/api/app.ts → pages/dashboard/create/ToolModal.tsx:141 | 工具管理→创建工具→选择HTTP工具集→确认创建时调用 |
| /core/app/mcpTool/create（通过 postCreateMCPTools） | POST | 创建 MCP 工具集 | web/core/app/api/app.ts → pages/dashboard/create/ToolModal.tsx:149 | 工具管理→创建工具→选择MCP工具集→确认创建时调用 |
| /core/app/template/list（getTemplateMarketItemList） | GET | 获取快速创建模板列表 | 模板市场 API → pages/dashboard/create/ToolModal.tsx:87 | 工具管理→创建工具→选择工作流工具→加载模板列表时调用 |

### `/core/app/list` 调用链

```
AppListContextProvider (context.tsx:119)
  ├── 触发: 进入工具管理页面 / 滚动到底部触发无限加载 / 搜索词变化 / 类型筛选变化
  ├── 参数: { parentId, type: [toolFolder, workflowTool, mcpToolSet, httpToolSet], searchKey, pageNum, pageSize }
  └── 响应处理: 追加到 myApps[] 数组；设置 hasMore 标志；空列表时显示空状态提示

List (List.tsx)
  └── 消费: 读取 myApps[] 渲染工具卡片网格
```

### `/core/app/folder/create` 调用链

```
MyTools (pages/dashboard/tool/index.tsx:80)
  ├── 触发: 用户点击"新建文件夹" → 填写名称/简介/头像 → 点击确认
  ├── 参数: { name, intro, avatar, parentId, type: 'toolFolder' }
  └── 响应处理: 成功后调用 loadMyApps() 刷新工具列表
```

### `/core/app/del` 调用链

```
MyTools (pages/dashboard/tool/index.tsx:86)
  ├── 触发: 文件夹详情面板→点击删除→确认PopoverConfirm
  ├── 参数: { appId: folderDetail._id }
  └── 响应处理: 清除本地存储的日志key；路由跳转至上级文件夹

List (List.tsx:108)
  ├── 触发: 工具卡片→更多菜单→删除→确认DelConfirmModal
  ├── 参数: { appId: 选中工具._id }
  └── 响应处理: 成功后调用 loadMyApps() 刷新列表
```

### `/core/app/update` 调用链

```
AppListContextProvider (context.tsx:158)
  ├── 触发: 编辑工具/文件夹信息后提交 (EditResourceModal / EditFolderModal)
  ├── 参数: { id, name, intro, avatar, ... }
  └── 响应处理: 同时刷新 refetchFolderDetail() + refetchPaths() + loadMyApps()

List (List.tsx:88)
  ├── 触发: 拖拽工具到文件夹 (useFolderDrag) → 父级变更
  ├── 参数: { id, parentId: 目标文件夹ID }
  └── 响应处理: 显示移动成功提示；刷新列表
```
