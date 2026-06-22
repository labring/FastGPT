---
capability_label: "应用工作台"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:30:00Z"
parent_module: "工作台"
roles: ["团队管理员", "应用创建者", "应用协作者", "只读成员"]
router_paths: ["/dashboard/agent"]
---

# 应用工作台 — API索引

## 应用列表查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/list` | POST | 分页获取应用列表 | `src/web/core/app/api.ts:27` → `src/pageComponents/dashboard/agent/context.tsx:119` | 应用工作台→浏览列表→页面加载时调用；应用工作台→浏览列表→滚动加载更多时调用；应用工作台→浏览列表→切换类型筛选时调用；应用工作台→浏览列表→搜索时调用 |
| `/core/app/detail` | GET | 获取应用/文件夹详情 | `src/web/core/app/api.ts:45` → `src/pageComponents/dashboard/agent/context.tsx:148` | 应用工作台→文件夹导航→进入文件夹时调用（用于面板展示） |

## 文件夹操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/folder/create` | POST | 创建应用文件夹 | `src/web/core/app/api/app.ts:14` → `src/pages/dashboard/agent/index.tsx:78` | 应用工作台→创建文件夹→提交创建表单时调用 |
| `/core/app/folder/path` | GET | 获取文件夹面包屑路径 | `src/web/core/app/api/app.ts:17` → `src/pageComponents/dashboard/agent/context.tsx:139` | 应用工作台→文件夹导航→进入文件夹或刷新时调用 |

## 应用 CRUD

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/update` | PUT | 更新应用信息 | `src/web/core/app/api.ts:50` → `src/pageComponents/dashboard/agent/context.tsx:157`（onUpdateApp） | 应用工作台→编辑信息→提交时调用；应用工作台→移动应用→确认目标时调用；应用工作台→卡片菜单→置顶/取消置顶时调用 |
| `/core/app/del` | DELETE | 删除应用/文件夹 | `src/web/core/app/api.ts:40` → `src/pageComponents/dashboard/agent/List.tsx:113`；`src/pages/dashboard/agent/index.tsx:84` | 应用工作台→删除应用→确认后调用；应用工作台→删除文件夹→确认后调用 |
| `/core/app/copy` | POST | 复制应用 | `src/web/core/app/api/app.ts:27` → `src/pageComponents/dashboard/agent/List.tsx:130` | 应用工作台→复制应用→确认后调用 |

## 应用创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/create` | POST | 创建新应用 | `src/web/core/app/api.ts:34` → CreateModal 内部 | 应用工作台→创建应用→选择模板提交时调用（由 CreateModal 组件内部触发） |

## 权限与协作者管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/getPermission` | GET | 获取应用协作者列表 | `src/web/core/app/api.ts:53` → ConfigPerModal 内部 | 应用工作台→权限管理→打开权限面板时调用；文件夹详情→权限管理→打开面板时调用 |
| `/proApi/core/app/collaborator/update` | POST | 更新应用协作者 | `src/web/core/app/api/collaborator.ts:12` → `src/pageComponents/dashboard/agent/List.tsx:278`（通过 ConfigPerModal） | 应用工作台→权限管理→添加/修改协作者时调用 |
| `/proApi/core/app/collaborator/delete` | DELETE | 删除协作者 | `src/web/core/app/api/collaborator.ts:15` → `src/pageComponents/dashboard/agent/List.tsx:289`（通过 ConfigPerModal） | 应用工作台→权限管理→删除协作者时调用 |
| `/core/app/resumeInheritPermission` | GET | 恢复权限继承 | `src/web/core/app/api.ts:62` → `src/pageComponents/dashboard/agent/List.tsx:140` | 应用工作台→权限管理→点击"恢复继承"时调用；文件夹详情→权限管理→恢复继承时调用 |
| `/proApi/core/app/changeOwner` | POST | 转让应用所有者 | `src/web/core/app/api.ts:65` → ConfigPerModal 内部 | 应用工作台→权限管理→转让所有者时调用（仅所有者可见） |

## 文件上传

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 预签名 URL | — | 获取头像上传预签名 URL | `src/web/common/file/api.ts` → `src/pages/dashboard/agent/index.tsx`（通过 EditFolderModal） | 应用工作台→编辑文件夹→上传头像时调用 |

## 应用导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/exportSkill` | POST | 导出应用为 Skill 压缩包 | `src/web/core/app/api.ts:75` → ExportSkillModal 内部 | 应用工作台→导出为Skill→确认导出时调用（返回 Blob 触发浏览器下载） |

---

## API 调用链追踪

### `/core/app/list` 调用链

```
AppListContextProvider (context.tsx:117-126)
  ├── 触发: 页面加载、type筛选变化、searchKey变化(500ms防抖)、parentId变化
  ├── 参数: parentId(文件夹ID/null), type(应用类型数组), searchKey(搜索词), pageNum, pageSize
  ├── 数据处理: 通过 useInfiniteScroll 管理分页列表，自动追加/刷新
  └── 响应处理: 设置 myApps 列表、hasMore、total；isFetchingApps 状态控制加载指示器

List 组件 (List.tsx:38)
  ├── 触发: 各种操作完成后的列表刷新（loadMyApps）
  ├── 参数: 从 AppListContext 获取
  └── 响应处理: 自动更新 UI 列表展示
```

### `/core/app/del` 调用链

```
List 组件 (List.tsx:108-125)
  ├── 触发: 用户在 AppCard 菜单中点击"删除"→确认弹窗输入名称确认
  ├── 参数: appId
  ├── 前置: 检查 lastChatAppId，若一致则清除；localStorage 移除对应缓存
  └── 响应处理: 成功→toast 提示"删除成功"，调用 loadMyApps 刷新列表

MyApps 页面 (index.tsx:84-97)
  ├── 触发: 用户在文件夹详情面板中点击"删除文件夹"
  ├── 参数: folderDetail._id
  ├── 前置: 弹出确认弹窗，提示"确认删除该文件夹？"
  └── 响应处理: 删除后 redirect router 到上级 parentId；localStorage 清除缓存
```

### `/core/app/update` 调用链

```
AppListContextProvider (context.tsx:157-162)
  ├── 触发: EditFolderModal 提交编辑、AppCard 菜单"置顶/取消置顶"、MoveModal 确认移动
  ├── 参数: id(应用ID), data({name?, intro?, avatar?, parentId?, isPinned?})
  └── 响应处理: 并行刷新 refetchFolderDetail、refetchPaths、loadMyApps

List 组件 (List.tsx:88-92)
  ├── 触发: EditResourceModal 提交编辑（应用信息修改）
  ├── 参数: id, data
  └── 响应处理: 成功→loadMyApps 刷新列表
```

### `/core/app/folder/path` 调用链

```
AppListContextProvider (context.tsx:138-144)
  ├── 触发: parentId 变化时自动调用
  ├── 参数: sourceId=parentId, type='current'
  ├── 条件: sourceId 为 null 时跳过请求返回空数组
  └── 响应处理: 设置 paths 状态，用于渲染面包屑导航
```

### `/core/app/detail` 调用链

```
AppListContextProvider (context.tsx:146-155)
  ├── 触发: parentId 变化时自动调用
  ├── 参数: appId=parentId
  ├── 条件: parentId 为 null 时不请求，直接返回 null
  └── 响应处理: 设置 folderDetail 状态，驱动文件夹详情面板展示
```

### `/core/app/copy` 调用链

```
List 组件 (List.tsx:130-136)
  ├── 触发: AppCard 菜单"复制应用"→确认弹窗确认
  ├── 参数: appId
  └── 响应处理: 成功→toast 提示"复制成功"，跳转 /app/detail?appId={newAppId}，刷新列表
```

### `/core/app/resumeInheritPermission` 调用链

```
List 组件 (List.tsx:138-149)
  ├── 触发: ConfigPerModal 中点击"恢复权限继承"
  ├── 参数: appId
  └── 响应处理: 成功→loadMyApps 刷新（权限状态更新）

MyApps 页面 (index.tsx)
  ├── 触发: 文件夹详情面板 FolderSlideCard 中点击恢复继承
  ├── 参数: folderDetail._id
  └── 响应处理: 并行刷新 refetchFolderDetail 和 loadMyApps
```
