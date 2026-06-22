---
capability_label: "应用详情"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: "应用"
roles: ["Owner", "管理员(manage)", "编辑者(write)", "只读者(read)", "日志查看者(readChatLog)"]
router_paths: ["/app/detail"]
---

# 应用详情 — API索引

## 应用 CRUD

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/detail` | GET | 获取应用完整详情（含权限、模块、配置） | `web/core/app/api.ts` → `context.tsx:172` | 应用详情→页面初始化→加载时调用 |
| `/core/app/update` | PUT | 更新应用基础信息（名称、头像、简介） | `web/core/app/api.ts` → `context.tsx:198`（updateAppDetail） | 应用详情→编辑应用信息→保存时调用；应用详情→团队标签→保存时调用 |
| `/core/app/del` | DELETE | 删除应用 | `web/core/app/api.ts` → `context.tsx:269`（deleteApp） | 应用详情→Header菜单→确认删除时调用 |
| `/proApi/core/app/changeOwner` | POST | 转让应用所有者 | `web/core/app/api.ts` | 应用详情→权限配置→转让所有者时调用 |

## 版本与发布

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/version/publish` | POST | 发布/保存应用版本 | `web/core/app/api/version.ts` → `context.tsx:241`（onSaveApp） | 应用详情→编辑器→点击保存时调用；离开页面自动保存时调用 |
| `/core/app/version/latest` | GET | 获取应用最新已发布版本 | `web/core/app/api/version.ts` → `context.tsx:190` | 应用详情→页面初始化→有写权限时自动加载 |
| `/core/app/version/list` | POST | 获取版本历史列表（分页） | `web/core/app/api/version.ts` → PublishHistoriesSlider | 应用详情→Header→版本历史→打开时调用 |
| `/core/app/version/detail` | GET | 获取指定版本详情 | `web/core/app/api/version.ts` | 应用详情→版本历史→切换版本时调用 |

## 权限与协作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/getPermission` | GET | 获取应用权限信息 | `web/core/app/api.ts` → InfoModal | 应用详情→编辑应用信息→加载权限时调用 |
| `/core/app/resumeInheritPermission` | GET | 恢复继承父级权限 | `web/core/app/api.ts` → InfoModal | 应用详情→编辑应用信息→点击恢复继承权限时调用 |
| `/proApi/core/app/collaborator/list` | GET | 获取应用协作者列表 | `web/core/app/api/collaborator.ts` → InfoModal | 应用详情→编辑应用信息→加载协作者列表时调用 |
| `/proApi/core/app/collaborator/update` | POST | 更新协作者权限 | `web/core/app/api/collaborator.ts` → InfoModal | 应用详情→编辑应用信息→保存协作者变更时调用 |
| `/proApi/core/app/collaborator/delete` | DELETE | 删除指定协作者 | `web/core/app/api/collaborator.ts` → InfoModal | 应用详情→编辑应用信息→移除协作者时调用 |

## OpenAPI Key 管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/openapi/list` | GET | 获取应用 API Key 列表 | `web/support/openapi/api.ts` → ApiKeyTable | 应用详情→发布→API Tab→加载时调用 |
| `/support/openapi/create` | POST | 创建新的 API Key | `web/support/openapi/api.ts` → EditKeyModal | 应用详情→发布→API Tab→新建 Key 时调用 |
| `/support/openapi/update` | PUT | 更新 API Key（名称、限额、过期时间） | `web/support/openapi/api.ts` → EditKeyModal | 应用详情→发布→API Tab→编辑 Key 时调用 |
| `/support/openapi/delete` | DELETE | 删除指定 API Key | `web/support/openapi/api.ts` → ApiKeyTable | 应用详情→发布→API Tab→删除 Key 时调用 |

## 日志与监控

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/logs/list` | POST | 获取应用对话日志列表 | `web/core/app/api/log.ts` → Logs/LogTable | 应用详情→日志→加载时调用；分页/筛选时调用 |
| `/proApi/core/app/logs/getTotalData` | GET | 获取应用总览统计数据 | `web/core/app/api/log.ts` → Dashboard | 应用详情→看板→加载时调用 |
| `/proApi/core/app/logs/getChartData` | POST | 获取图表统计数据 | `web/core/app/api/log.ts` → Logs/LogChart | 应用详情→看板→加载图表时调用 |
| `/core/app/logs/getLogKeys` | GET | 获取日志显示字段配置 | `web/core/app/api/log.ts` → SyncLogKeysPopover | 应用详情→日志→配置显示列→打开时调用 |
| `/core/app/logs/updateLogKeys` | POST | 更新日志显示字段配置 | `web/core/app/api/log.ts` | 应用详情→日志→配置显示列→保存时调用 |
| `/core/app/logs/getUsers` | POST | 获取日志用户筛选列表 | `web/core/app/api/log.ts` → UserFilter | 应用详情→日志→用户筛选→下拉加载时调用 |
| `/core/chat/correction/list` | POST | 获取对话纠错列表 | `web/core/chat/api.ts` → CorrectionModal | 应用详情→日志→对话详情→纠错→加载时调用 |
| `/core/chat/correction/delete` | POST | 删除纠错记录 | `web/core/chat/api.ts` → CorrectionModal | 应用详情→日志→对话详情→删除纠错时调用 |
| `/core/chat/correction/submit` | POST | 提交纠错 | `web/core/chat/api.ts` → CorrectionModal | 应用详情→日志→对话详情→提交纠错时调用 |

## MCP 工具集

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/mcpTools/update` | POST | 保存 MCP 工具集配置 | `web/core/app/api/mcpTools.ts` → MCPTools/Header | 应用详情→MCP编辑器→点击保存时调用 |
| `/core/app/mcpTools/getTools` | POST | 从 MCP Server 获取工具列表 | `web/core/app/api/mcpTools.ts` → MCPTools/EditForm | 应用详情→MCP编辑器→输入URL后获取工具时调用 |
| `/core/app/mcpTools/runTool` | POST | 测试运行 MCP 工具 | `web/core/app/api/mcpTools.ts` → MCPTools/ChatTest | 应用详情→MCP编辑器→测试区运行工具时调用 |

## HTTP 工具集

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/httpTools/getApiSchemaByUrl` | POST | 根据 URL 获取 API Schema | `web/core/app/api/httpTools.ts` → HTTPTools/EditForm | 应用详情→HTTP编辑器→输入URL解析Schema时调用 |
| `/core/app/httpTools/update` | POST | 更新 HTTP 工具配置 | `web/core/app/api/httpTools.ts` → HTTPTools/EditForm | 应用详情→HTTP编辑器→保存配置时调用 |
| `/core/app/httpTools/runTool` | POST | 测试运行 HTTP 工具 | `web/core/app/api/httpTools.ts` → HTTPTools/ChatTest | 应用详情→HTTP编辑器→测试区运行工具时调用 |

## 聊天测试

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/chat/chatTest` | POST (SSE) | 工作流/应用调试运行（流式） | `web/core/chat/api.ts` → useChatTest.tsx | 应用详情→编辑器→ChatTest面板→发送消息时调用 |
| `/core/chat/init` | GET | 初始化聊天信息（变量、历史、生成状态） | `web/core/chat/api.ts` → useChatTest.tsx | 应用详情→编辑器→ChatTest面板→加载时自动调用 |

## 文件与标签

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/common/file/presignAvatarPostUrl` | POST | 获取头像上传预签名 URL | `web/common/file/api.ts` → InfoModal | 应用详情→编辑应用信息→上传头像时调用 |
| `/proApi/support/user/team/tag/list` | GET | 获取团队所有可用标签 | `web/support/user/team/api.ts` → TagsEditModal | 应用详情→团队标签弹窗→打开时调用 |

## `/core/app/detail` 调用链

```
AppContextProvider (context.tsx)
  ├── 触发: 页面挂载时自动调用（manual: false），依赖 appId 变化
  ├── 参数: appId（从 router.query 中获取）
  ├── 响应处理: setAppDetail → 更新 AppContext 中的 appDetail 状态
  ├── 错误处理: toast "获取应用信息失败"，router.replace('/dashboard/agent')
  └── 分支: appId 为空时返回 defaultApp（空对象）

ApiKeyTable
  ├── 触发: 发布-API Tab 挂载时自动调用
  ├── 参数: appId
  └── 响应处理: 获取 app 头像和名称用于 API 调用示例弹窗
```

## `/core/app/version/publish` 调用链

```
onSaveApp (context.tsx)
  ├── 触发: Header 保存按钮 / 离开页面自动保存（autoSave）
  ├── 参数: { nodes, edges, chatConfig, isPublish, versionName }
  ├── 前置检查: !hasWritePer → 拒绝操作
  ├── 模型校验（仅 isOwner）: 提取工作流中 modelIds，与系统模型列表比对，无效模型 toast 警告
  ├── 响应处理: setAppDetail 更新 + reloadAppLatestVersion 刷新版本
  └── 错误处理: AppErrEnum.unExist → return（静默）；其他 → Promise.reject

Plugin/Header (Plugin/Header.tsx:88)
  ├── 触发: 保存按钮
  ├── 参数: flowData2StoreData() 提取画布数据 → { nodes, edges, version: 'v2' }
  └── 响应处理: 同 onSaveApp

Workflow/Header
  ├── 触发: 保存按钮
  └── 参数: flowData2StoreData() 提取画布数据
```

## `/core/app/del` 调用链

```
onDelApp (context.tsx)
  ├── 触发: Header 菜单 → 删除 → 确认弹窗（需输入应用名称）
  ├── 参数: appId
  ├── 确认弹窗: AI 应用提示"确认删除该应用？删除后无法恢复"，工具提示"确认删除该工具？"
  ├── 响应处理: 删除成功 → 清除 localStorage app_log_keys_{appId} → router.replace(/dashboard/agent | /dashboard/tool)
  ├── Toast: 成功"删除成功" / 失败"删除失败"
  └── 错误处理: appDetail 为空 → reject
```

## `/core/chat/chatTest` 调用链

```
useChatTest (useChatTest.tsx)
  ├── 触发: 用户在 ChatTest 面板输入消息并发送
  ├── 参数: { chatId, messages, appId, variables, ... }
  ├── 前置: getInitChatInfo 获取 chatId + 历史记录 + 变量
  ├── 响应: SSE 流式返回 AI 回复
  └── 错误: 停止生成 → postStopV2Chat
```
