---
capability_label: 工具配置首页
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 工具配置
roles: [admin]
router_paths: [/config/tool]
---

# 工具配置首页 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/core/plugin/admin/tool/list` | GET | 获取系统工具列表 | `web/core/plugin/admin/tool/api.ts:22` → `pages/config/tool/index.tsx:51` | 配置→工具配置首页→页面加载时调用；配置→工具配置首页→添加/编辑/删除工具后刷新列表 |
| `/api/aiproxy/api/core/plugin/admin/tool/detail` | GET | 获取单个工具详情 | `web/core/plugin/admin/tool/api.ts:25` → `pageComponents/config/tool/SystemToolConfigModal.tsx:59`；`pageComponents/config/tool/WorkflowToolConfigModal.tsx:88` | 配置→工具配置首页→点击工具行→打开配置弹窗时调用 |
| `/api/aiproxy/api/core/plugin/admin/tool/app/systemApps` | POST | 获取可关联的应用列表 | `web/core/plugin/admin/tool/api.ts:38` → `pageComponents/config/tool/WorkflowToolConfigModal.tsx:128` | 配置→工具配置首页→打开工作流工具配置弹窗→搜索关联应用时调用 |
| `/api/aiproxy/api/core/plugin/toolTag/list` | GET | 获取工具标签列表 | `web/core/plugin/toolTag/api.ts:6` → `pageComponents/config/tool/SystemToolConfigModal.tsx:112`；`pageComponents/config/tool/WorkflowToolConfigModal.tsx:135` | 配置→工具配置首页→打开配置弹窗→加载标签选项时调用 |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/core/plugin/admin/tool/update` | PUT | 更新工具配置 | `web/core/plugin/admin/tool/api.ts:28` → `pageComponents/config/tool/ToolRow.tsx:39`；`pageComponents/config/tool/SystemToolConfigModal.tsx:142`；`pageComponents/config/tool/WorkflowToolConfigModal.tsx:195` | 配置→工具配置首页→快捷切换默认安装/Token费用时调用；配置→工具配置首页→系统工具配置弹窗→保存时调用；配置→工具配置首页→工作流工具配置弹窗→保存时调用 |
| `/api/aiproxy/api/core/plugin/admin/tool/updateOrder` | PUT | 更新工具排序 | `web/core/plugin/admin/tool/api.ts:31` → `pages/config/tool/index.tsx:158` | 配置→工具配置首页→拖拽工具行→松手完成排序时调用 |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/core/plugin/admin/tool/app/create` | POST | 创建应用类型工具 | `web/core/plugin/admin/tool/api.ts:41` → `pageComponents/config/tool/WorkflowToolConfigModal.tsx:198` | 配置→工具配置首页→"添加资源"→"选择应用"→填写信息→提交创建时调用 |

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/core/plugin/admin/tool/delete` | DELETE | 删除工作流/应用类型工具 | `web/core/plugin/admin/tool/api.ts:34` → `pageComponents/config/tool/WorkflowToolConfigModal.tsx:212` | 配置→工具配置首页→工作流工具配置弹窗→点击删除→确认后调用 |
| `/api/aiproxy/api/core/plugin/admin/pkg/delete` | DELETE | 删除系统内置插件包 | `web/core/plugin/admin/api.ts:23` → `pageComponents/config/tool/SystemToolConfigModal.tsx:156` | 配置→工具配置首页→系统工具配置弹窗→点击删除→确认后调用 |

## API 调用链追踪

### `GET /core/plugin/admin/tool/list` 调用链

```
pages/config/tool/index.tsx — ToolProvider
  ├── 触发: 页面加载（manual: false，自动请求）
  ├── 参数: { parentId: null }
  ├── 响应处理: setLocalTools(data)，作为 DndDrag 的 dataList
  └── 刷新触发: 添加/编辑/删除工具后通过 refreshTools 重新调用
```

### `GET /core/plugin/admin/tool/detail` 调用链

```
pageComponents/config/tool/SystemToolConfigModal.tsx
  ├── 触发: 弹窗打开（toolId 变化时自动请求）
  ├── 参数: { toolId }
  ├── 响应处理: reset(formData) 填充表单，setSelectedTags(res.tags)
  └── 依赖: manual: false

pageComponents/config/tool/WorkflowToolConfigModal.tsx
  ├── 触发: 弹窗打开（toolId 存在时自动请求）
  ├── 参数: { toolId }
  ├── 响应处理: reset(res) 填充表单，setSelectedTags(res.tags)
  └── 依赖: manual: false
```

### `PUT /core/plugin/admin/tool/update` 调用链

```
pageComponents/config/tool/ToolRow.tsx — ToolRow
  ├── 触发: 用户点击默认安装复选框或 Token 费用开关
  ├── 参数: { pluginId, defaultInstalled?, hasTokenFee?, status? }
  ├── 响应处理: setLocalTools(prev => prev.map(...)) 局部更新列表
  └── 错误: toast 提示 "更新失败"

pageComponents/config/tool/SystemToolConfigModal.tsx
  ├── 触发: 用户点击确认按钮
  ├── 参数: { pluginId, status, defaultInstalled, inputListVal, systemKeyCost, childTools, promoteTags, hideTags, tagIds }
  ├── 响应处理: onSuccess() + onClose()，刷新列表
  └── 成功: toast "配置成功"

pageComponents/config/tool/WorkflowToolConfigModal.tsx
  ├── 触发: 用户点击确认按钮（编辑模式 toolId 存在）
  ├── 参数: { pluginId, name, avatar, intro, tagIds, associatedPluginId, userGuide, author, status, defaultInstalled, currentCost, hasTokenFee }
  ├── 响应处理: onSuccess() + onClose()，刷新列表
  └── 成功: toast "配置成功"
```

### `PUT /core/plugin/admin/tool/updateOrder` 调用链

```
pages/config/tool/index.tsx — ToolProvider
  ├── 触发: 用户完成拖拽（DndDrag onDragEndCb）
  ├── 参数: { plugins: [{ pluginId, pluginOrder }] }
  ├── 响应处理: setLocalTools(list)（已在拖拽回调中乐观更新）
  └── 无显式错误提示
```

### `POST /core/plugin/admin/tool/app/create` 调用链

```
pageComponents/config/tool/WorkflowToolConfigModal.tsx
  ├── 触发: 用户点击确认按钮（新建模式 toolId 不存在）
  ├── 参数: { name, avatar, intro, tagIds, associatedPluginId, userGuide, author, status, defaultInstalled, currentCost, hasTokenFee }
  ├── 响应处理: onSuccess() + onClose()，刷新列表
  └── 成功: toast "配置成功"
```

### `DELETE /core/plugin/admin/tool/delete` 调用链

```
pageComponents/config/tool/WorkflowToolConfigModal.tsx
  ├── 触发: 用户点击删除按钮 → PopoverConfirm 确认
  ├── 参数: { toolId }
  ├── 响应处理: toast "删除成功" → onSuccess() + onClose()
  └── 前置: toolId 存在（仅编辑模式显示删除按钮）
```

### `DELETE /core/plugin/admin/pkg/delete` 调用链

```
pageComponents/config/tool/SystemToolConfigModal.tsx
  ├── 触发: 用户点击删除按钮 → PopoverConfirm 确认
  ├── 参数: { toolId: toolId.split('-')[1] }（提取 pkg 部分）
  ├── 响应处理: onSuccess() + onClose()，刷新列表
  └── 前置: 任意状态均可删除
```
