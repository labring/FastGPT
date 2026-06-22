---
capability_label: 配置
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: null
roles: [系统管理员]
router_paths: ["/config/tool", "/config/tool/marketplace"]
---

## API 索引

配置模块涵盖系统工具管理和工具市场两大子能力，对应以下 API 端点。所有端点均需系统管理员权限（`authSystemAdmin`）。

### 系统工具管理

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/core/plugin/admin/tool/list` | 获取系统工具列表 |
| GET | `/api/core/plugin/admin/tool/detail` | 获取系统工具详情 |
| POST | `/api/core/plugin/admin/tool/update` | 更新系统工具配置 |
| POST | `/api/core/plugin/admin/tool/delete` | 删除系统工具 |
| POST | `/api/core/plugin/admin/tool/updateOrder` | 更新系统工具排序 |
| GET | `/api/core/plugin/admin/tool/app/systemApps` | 获取可注册为工具的工作流应用列表 |
| POST | `/api/core/plugin/admin/tool/app/create` | 将工作流应用创建为系统工具 |

### 工具标签管理

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/core/plugin/admin/tool/tag/create` | 创建工具标签 |
| POST | `/api/core/plugin/admin/tool/tag/update` | 更新工具标签 |
| POST | `/api/core/plugin/admin/tool/tag/delete` | 删除工具标签 |
| POST | `/api/core/plugin/admin/tool/tag/updateOrder` | 更新标签排序 |

### 工具包管理

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/core/plugin/admin/pkg/parse` | 解析上传的工具包 |
| POST | `/api/core/plugin/admin/pkg/presign` | 获取工具包上传预签名 URL |
| POST | `/api/core/plugin/admin/pkg/confirm` | 确认工具包上传 |
| POST | `/api/core/plugin/admin/pkg/delete` | 删除已安装的工具包 |
| POST | `/api/core/plugin/admin/installWithUrl` | 通过 URL 安装工具包 |

### 工具市场

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/marketplace/[...path]` | 工具市场 API 代理（转发至外部市场服务），支持 `api/tools`、`api/tools/{toolId}`、`api/tags`、`api/versions` 等子路径 |
| GET | `/api/core/plugin/admin/marketplace/installed` | 获取已安装的系统工具（含版本信息，用于判断更新） |

### 前端 API 调用封装

前端通过以下模块封装调用以上 API：

- `@/web/core/plugin/admin/tool/api` — 系统工具管理（getAdminSystemTools / putAdminUpdateTool / putAdminUpdateToolOrder）和标签管理（createPluginToolTag / updatePluginToolTag / deletePluginToolTag / updatePluginToolTagOrder）
- `@/web/core/plugin/admin/api` — 工具包管理（intallPluginWithUrl / deletePkgPlugin）
- `@/web/core/plugin/marketplace/api` — 工具市场（getMarketplaceTools / getMarketPlaceToolTags / getMarketplaceToolDetail / getMarketplaceDownloadURL / getMarketplaceDownloadURLs / getSystemInstalledPlugins / getMarketplaceToolVersions）
