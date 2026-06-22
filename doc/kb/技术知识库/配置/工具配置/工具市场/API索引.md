---
capability_label: 工具市场
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T12:00:00Z"
parent_module: "工具配置"
roles: ["admin"]
router_paths: ["/config/tool/marketplace"]
---

# 工具市场 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/marketplace/api/tool/list` | POST | 分页获取工具列表（支持搜索和标签筛选） | `projects/app/src/web/core/plugin/marketplace/api.ts:16` → `projects/app/src/pages/config/tool/marketplace.tsx:137` | 工具市场→浏览与搜索工具→加载时调用；工具市场→浏览与搜索工具→搜索/标签筛选/滚动翻页时调用 |
| `/marketplace/api/tool/tags` | GET | 获取所有工具标签 | `projects/app/src/web/core/plugin/marketplace/api.ts:22` → `projects/app/src/pages/config/tool/marketplace.tsx:164` | 工具市场→浏览与搜索工具→页面初始化时调用 |
| `/core/plugin/admin/marketplace/installed` | GET | 获取系统已安装工具列表 | `projects/app/src/web/core/plugin/marketplace/api.ts:13` → `projects/app/src/pages/config/tool/marketplace.tsx:150` | 工具市场→页面初始化时调用；工具市场→安装/卸载/更新工具→操作完成后刷新时调用 |

## 详情

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/marketplace/api/tool/detail` | GET | 获取单工具详情（含参数、readme 等） | `projects/app/src/web/core/plugin/marketplace/api.ts:19` → `projects/app/src/pages/config/tool/marketplace.tsx:750` | 工具市场→查看工具详情→打开详情抽屉时调用；工具市场→批量更新→查看单个工具详情时调用 |
| `/marketplace/api/tool/versions` | GET | 获取所有工具在 Marketplace 上的最新版本 | `projects/app/src/web/core/plugin/marketplace/api.ts:31` → `projects/app/src/pages/config/tool/marketplace.tsx:168` | 工具市场→页面初始化时调用（用于计算可更新工具列表） |

## 下载

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/marketplace/api/tool/getDownloadUrl` | GET | 获取单个工具的下载链接 | `projects/app/src/web/core/plugin/marketplace/api.ts:25` → `projects/app/src/pages/config/tool/marketplace.tsx:182` | 工具市场→安装工具→点击安装时调用；工具市场→更新工具→点击更新时调用 |
| `/marketplace/api/tool/getDownloadUrl` | POST | 批量获取多个工具的下载链接 | `projects/app/src/web/core/plugin/marketplace/api.ts:28` → `projects/app/src/pages/config/tool/marketplace.tsx:287` | 工具市场→批量更新工具→点击批量更新时调用 |

## 安装/更新/删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/plugin/admin/installWithUrl` | POST | 通过下载链接安装或更新工具 | `projects/app/src/web/core/plugin/admin/api.ts:25` → `projects/app/src/pages/config/tool/marketplace.tsx:190` | 工具市场→安装工具→获取下载链接后调用；工具市场→更新工具→获取下载链接后调用；工具市场→批量更新→批量获取下载链接后调用 |
| `/core/plugin/admin/pkg/delete` | DELETE | 删除已安装的工具 | `projects/app/src/web/core/plugin/admin/api.ts:22` → `projects/app/src/pages/config/tool/marketplace.tsx:262` | 工具市场→卸载工具→点击卸载时调用 |

## API 调用链追踪

### `POST /marketplace/api/tool/list` 调用链

```
ToolkitMarketplace (projects/app/src/pages/config/tool/marketplace.tsx)
  ├── 触发: 页面初始化 / 搜索关键词变化 / 标签筛选变化 / 滚动翻页
  ├── 参数: { pageNum, pageSize, searchKey?, tags? }
  ├── Hook: usePagination（滚动分页模式，defaultPageSize=20）
  ├── 刷新依赖: [searchText, tagIds]
  └── 响应处理: 合并已安装状态、i18n 名称解析、标签名称匹配 → displayTools
```

### `GET /core/plugin/admin/marketplace/installed` 调用链

```
ToolkitMarketplace (projects/app/src/pages/config/tool/marketplace.tsx)
  ├── 触发: 页面初始化（manual: false，自动执行）；安装/卸载/更新完成后手动调用 refreshInstalledPlugins()
  ├── 参数: { type: 'tool' }
  ├── Hook: useRequest
  └── 响应处理: 构建 ids (Set<string>) + map (Map<id, item>) → systemInstalledPlugins
```

### `GET /marketplace/api/tool/tags` 调用链

```
ToolkitMarketplace (projects/app/src/pages/config/tool/marketplace.tsx)
  ├── 触发: 页面初始化（manual: false）
  ├── Hook: useRequest
  └── 响应处理: 直接作为 allTags 使用，传递给 ToolTagFilterBox
```

### `GET /marketplace/api/tool/detail` 调用链

```
ToolDetailDrawer (packages/web/components/core/plugin/tool/ToolDetailDrawer.tsx)
  ├── 触发: 用户点击工具卡片打开详情抽屉
  ├── 参数: { toolId }
  └── 响应处理: 通过 useToolDetail hook 解析为 parentTool / isToolSet / subTools / readmeContent

BatchUpdateDrawer (packages/web/components/core/plugin/tool/BatchUpdateDrawer.tsx)
  ├── 触发: 批量更新抽屉中点击「查看详情」切换到 detail 视图
  ├── 参数: { toolId }
  └── 响应处理: 同 ToolDetailDrawer 使用 useToolDetail hook
```

### `GET /marketplace/api/tool/getDownloadUrl` (单个) 调用链

```
ToolkitMarketplace (projects/app/src/pages/config/tool/marketplace.tsx)
  ├── 触发: 用户点击单个工具的安装或更新按钮
  ├── 参数: toolId (string)
  └── 响应处理: 获取 downloadUrl → 传给 intallPluginWithUrl 执行安装
```

### `POST /marketplace/api/tool/getDownloadUrl` (批量) 调用链

```
ToolkitMarketplace (projects/app/src/pages/config/tool/marketplace.tsx)
  ├── 触发: 批量更新抽屉中点击「批量更新」按钮
  ├── 参数: { toolIds: string[] }
  └── 响应处理: 获取 downloadUrls[] → 传给 intallPluginWithUrl 执行批量安装
```

### `POST /core/plugin/admin/installWithUrl` 调用链

```
ToolkitMarketplace (projects/app/src/pages/config/tool/marketplace.tsx)
  ├── 触发: 获取到 downloadUrl(s) 之后自动调用
  ├── 参数: { downloadUrls: string[] }
  └── 响应处理: 刷新已安装列表 + 更新工具卡片状态（若详情抽屉打开则同步更新）

```markdown
### `DELETE /core/plugin/admin/pkg/delete` 调用链

```
ToolkitMarketplace (projects/app/src/pages/config/tool/marketplace.tsx)
  ├── 触发: 用户点击已安装工具的卸载按钮
  ├── 参数: { toolId: string }
  └── 响应处理: 刷新已安装列表 → 更新工具卡片状态为「未安装」
```
