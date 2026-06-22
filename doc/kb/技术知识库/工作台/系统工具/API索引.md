---
capability_label: 系统工具
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: 工作台
roles: ["所有用户", "root管理员"]
router_paths: ["/dashboard/systemTool"]
---

# 系统工具 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/plugin/team/list` | GET | 获取团队系统工具列表 | `projects/app/src/web/core/plugin/team/api.ts:12` → `projects/app/src/pages/dashboard/systemTool/index.tsx:77` | 系统工具→系统工具页面→加载时调用 |

**请求参数（`GetTeamSystemPluginListQueryType`）**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 固定为 `'tool'`，表示查询系统工具类型 |

**响应（`GetTeamPluginListResponseType`）**：返回工具对象数组，每个工具包含 `id`、`name`、`intro`、`avatar`、`author`、`tags`、`status`、`installed`、`associatedPluginId` 等字段。

### `/core/plugin/team/list` 调用链

```
系统工具页面 (index.tsx:77)
  ├── 触发: 页面加载时自动调用
  ├── 参数: { type: 'tool' }
  ├── 响应处理: setTools(data)，写入 tools state
  └── 错误处理: useRequest 默认错误处理，显示错误提示
```

---

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/plugin/toolTag/list` | GET | 获取工具标签列表（用于前端筛选） | `projects/app/src/web/core/plugin/toolTag/api.ts:6` → `projects/app/src/pages/dashboard/systemTool/index.tsx:63` | 系统工具→系统工具页面→加载时调用 |

**响应（`GetPluginTagListResponse`）**：返回标签对象数组，每个标签包含 `tagId`、`tagName`（国际化字符串）。

### `/core/plugin/toolTag/list` 调用链

```
系统工具页面 (index.tsx:63)
  ├── 触发: 页面加载时自动调用
  ├── 参数: 无
  ├── 响应处理: 直接写入 tags state，通过 parseI18nString 解析标签名
  └── 错误处理: useRequest 默认错误处理
```

---

## 配置/操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/plugin/team/toggleInstall` | POST | 安装或卸载系统工具 | `projects/app/src/web/core/plugin/team/api.ts:14` → `projects/app/src/pages/dashboard/systemTool/index.tsx:84` | 系统工具→系统工具页面→点击安装/卸载按钮时调用；系统工具→系统工具页面→工具详情抽屉中点击安装/卸载时调用 |

**请求参数（`ToggleInstallPluginBodyType`）**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pluginId | string | 是 | 工具 ID |
| installed | boolean | 是 | `true` 表示安装，`false` 表示卸载 |
| type | string | 是 | 固定为 `'tool'` |

### `/core/plugin/team/toggleInstall` 调用链

```
系统工具页面 (index.tsx:84)
  ├── 触发: 用户点击工具卡片的安装/卸载按钮
  ├── 参数: { pluginId, installed, type: 'tool' }
  ├── 前置处理: 检查 Promise 引用 Map 防止重复操作，dispatchLoading 设置 loading 状态
  ├── 响应处理: 更新 tools state 中对应工具的 installed 状态
  ├── 后置处理: dispatchLoading 移除 loading 状态，清理 Promise 引用
  └── 错误处理: finally 中清除 loading 状态，恢复按钮可用性

ToolDetailDrawer 详情抽屉 (index.tsx:271)
  ├── 触发: 用户在工具详情抽屉中点击安装/卸载
  ├── 参数: { pluginId: selectedTool.id, installed }
  └── 响应处理: 同主页面处理流程
```

> ⚠️ 注意：首页面的 `toggleInstall` 函数内部有并发控制逻辑，使用 `useRef<Map<string, Promise<void>>>` 存储每个工具的进行中操作。当同一工具的安装/卸载操作正在进行时，新的请求会 `await` 已有 Promise，而非发起新的 API 调用。

---

## 查询/详情

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/plugin/team/toolDetail` | GET | 获取工具详细信息（版本参数等） | `projects/app/src/web/core/plugin/team/api.ts:18` → `projects/app/src/pages/dashboard/systemTool/index.tsx:276` | 系统工具→系统工具页面→工具详情抽屉→展开查看版本详情时调用 |

**请求参数（`GetTeamToolDetailQueryType`）**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| toolId | string | 是 | 工具 ID |

**响应（`GetTeamToolDetailResponseType`）**：返回 `{ tools: ToolDetailItem[], downloadUrl: string }`，每个 ToolDetailItem 包含 `name`、`intro`、`icon`、`readme`、`versionList`（含 `inputs` 和 `outputs` 参数列表）。

### `/core/plugin/team/toolDetail` 调用链

```
系统工具页面 (index.tsx:276)
  ├── 触发: ToolDetailDrawer 的 onFetchDetail 回调，用户在抽屉中展开查看工具版本详情
  ├── 参数: { toolId }
  ├── 响应处理: 返回工具数组，交给 ToolDetailDrawer 渲染
  └── 错误处理: ToolDetailDrawer 内部处理
```
