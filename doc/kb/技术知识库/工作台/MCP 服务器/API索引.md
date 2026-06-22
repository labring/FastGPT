---
capability_label: MCP 服务器
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 工作台
roles:
  - 团队管理员
  - 团队成员（有 API 密钥创建权限）
router_paths:
  - /dashboard/mcpServer
---

# MCP 服务器 — API 索引

## API 总览

MCP 服务器管理 API 定义在 `projects/app/src/web/support/mcp/api.ts`，对应后端 OpenAPI 合约在 `packages/global/openapi/support/mcpServer/api.ts`。

### MCP 服务器列表查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/support/mcp/list` | GET | 获取当前团队 MCP 服务器列表 | `web/support/mcp/api.ts:8` → `pages/dashboard/mcpServer/index.tsx:48` | 工作台→MCP 服务器→页面加载时调用；删除成功后刷新调用 |

### MCP 服务器创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/support/mcp/create` | POST | 创建新的 MCP 服务器 | `web/support/mcp/api.ts:12` → `pageComponents/dashboard/mcp/EditModal.tsx:282` | 工作台→MCP 服务器→创建弹窗→提交表单时调用 |

### MCP 服务器更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/support/mcp/update` | PUT | 更新已有 MCP 服务器的名称和关联应用 | `web/support/mcp/api.ts:16` → `pageComponents/dashboard/mcp/EditModal.tsx:299` | 工作台→MCP 服务器→编辑弹窗→提交表单时调用 |

### MCP 服务器删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/support/mcp/delete` | DELETE | 删除指定的 MCP 服务器 | `web/support/mcp/api.ts:20` → `pages/dashboard/mcpServer/index.tsx:55` | 工作台→MCP 服务器→确认删除弹窗→确认时调用 |

### 应用相关（辅助 API）

MCP 服务器创建/编辑时使用以下应用管理 API 获取可选应用列表：

| API 路径 | 方法 | 用途 | 调用位置 |
|---------|------|------|---------|
| `/api/core/app/list`（推断） | GET | 获取当前团队的应用列表 | `web/core/app/api.ts` → `pageComponents/dashboard/mcp/EditModal.tsx:93` |
| `/api/core/app/basicInfoByIds`（推断） | GET | 批量获取应用基本信息 | `web/core/app/api.ts` → `pageComponents/dashboard/mcp/EditModal.tsx:73` |
| `/api/core/app/folderPath`（推断） | GET | 获取应用文件夹路径 | `web/core/app/api/app.ts` → `pageComponents/dashboard/mcp/EditModal.tsx:105` |

## API 调用链追踪

### `/api/support/mcp/list` 调用链

```
McpServer 页面组件
  ├── 触发: 页面加载（useRequest manual:false 自动请求）
  ├── 参数: 无
  └── 响应处理: 设置 mcpServerList 状态，驱动表格渲染；加载中设置 loadingList=true 显示 MyBox 加载遮罩

McpServer 页面组件
  ├── 触发: 删除成功后调用 refresh → loadMcpList()
  ├── 参数: 无
  └── 响应处理: 静默刷新列表，不显示加载遮罩
```

### `/api/support/mcp/create` 调用链

```
EditMcpModal 编辑弹窗
  ├── 触发: 用户填写名称和选择应用后点击「确认」按钮
  ├── 参数: { name: string, apps: [{ appId, toolName, appName, description }] }
  ├── 验证: name 必填（前端 required），apps 数组至少 1 项（前端验证）；后端通过 Zod schema 验证 name 1-100 字符、apps 1-50 项
  ├── 中间状态: 提交期间 isLoading 显示按钮 loading 动画，按钮保持可点击状态
  └── 响应处理: 成功 toast "创建成功" → 关闭弹窗 → 刷新列表；失败 toast 错误信息
```

### `/api/support/mcp/update` 调用链

```
EditMcpModal 编辑弹窗
  ├── 触发: 用户修改名称/应用后点击「确认」按钮（isEdit=true）
  ├── 参数: { id: string, name?: string, apps: [{ appId, toolName, appName, description }] }
  ├── 验证: name 可选（后端 allow），apps 数组至少 1 项（前端验证）；后端通过 Zod schema 验证
  ├── 中间状态: 提交期间 isLoading 显示按钮 loading 动画
  └── 响应处理: 成功 toast "更新成功" → 关闭弹窗 → 刷新列表；失败 toast 错误信息
```

### `/api/support/mcp/delete` 调用链

```
McpServer 页面组件
  ├── 触发: 用户点击删除按钮 → PopoverConfirm 弹出确认窗 → 点击确认
  ├── 参数: { id: string }
  ├── 确认弹窗: type="delete"，文案来自 i18n 键 dashboard_mcp:delete_mcp_server_confirm_tip
  └── 响应处理: 成功后调用 loadMcpList() 刷新列表；失败 toast 错误信息
```
