---
capability_label: 日志详情
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00Z"
parent_module: 设置
roles: [管理员]
router_paths: ["/chat?pane=s&tab=l"]
---

# 日志详情 — API索引

> 本文档建立 API 到业务场景的反向索引。本文中"日志详情"指 ChatSetting 中日志 Tab 模块直接使用的 API。

## 日志查询与导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/app/logs/list` | POST | 获取对话日志分页列表 | `api/log.ts:37` → `LogTable.tsx:151` | 日志详情→查看日志列表→加载时调用；日志详情→多维度筛选→筛选条件变更时调用；日志详情→批量删除→删除后刷新时调用 |
| `/api/core/app/logs/getLogKeys` | GET | 获取应用的日志列键配置 | `api/log.ts:34` → `context.tsx` | 日志详情→查看日志列表→初始化日志上下文时调用 |
| `/api/core/app/logs/updateLogKeys` | POST | 更新应用的日志列键配置 | `api/log.ts:31` → 同步弹窗 | 日志详情→配置日志列显示→同步到团队时调用 |
| `/api/core/app/logs/getUsers` | POST | 获取日志相关的用户列表 | `api/log.ts:46` → `UserFilter.tsx:61` | 日志详情→多维度筛选→用户筛选搜索时调用 |
| `/api/core/app/logs/exportLogs` | POST | 导出日志数据为 CSV | `LogTable.tsx:83` → 内联调用 | 日志详情→导出日志数据→点击导出时调用 |

## 对话详情与记录

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/chat/init` | GET | 获取对话初始化信息 | `chat/api.ts:32` → `DetailLogsModal.tsx:66` | 日志详情→查看单条对话详情→打开弹窗时调用 |
| `/api/core/chat/record/getRecords_v2` | POST | 获取对话记录列表 | `record/api.ts:21` → `ChatRecordContextProvider` | 日志详情→查看单条对话详情→加载对话记录时调用 |
| `/api/core/chat/history/batchDelete` | POST | 批量删除对话历史 | `history/api.ts:37` → `LogTable.tsx:180` | 日志详情→批量删除对话→确认删除时调用 |

## 对话设置（跨能力引用）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/proApi/core/chat/setting/detail` | GET | 获取对话页设置 | `chat/api.ts` → `ChatPageContextProvider` | 来源：对话首页设置→加载时调用，日志详情通过 ChatPageContext 消费 appId |

---

## API 调用链追踪

### `/api/core/app/logs/list` 调用链

```
LogTable
  ├── 触发: 进入日志详情页自动加载；筛选条件变更时重新加载；翻页/排序时加载
  ├── 参数: { appId, dateStart, dateEnd, sources?, tmbIds?, outLinkUids?, chatSearch?, feedbackFilter?, feedbackType?, unreadOnly?, errorFilter?, pageSize?, offset?, pageNum? }
  └── 响应处理: 更新分页数据（list + total）→ 渲染表格行

LogList (应用详情中的日志页，非本模块)
  ├── 触发: 进入应用日志页自动加载
  └── ...
```

### `/api/core/app/logs/getLogKeys` 调用链

```
LogsContextProvider
  ├── 触发: LogsContextProvider 挂载时自动调用（useRequest manual=false）
  ├── 参数: { appId }
  └── 响应处理: 存入 Context（teamLogKeys） + localStorage 缓存
```

### `/api/core/app/logs/getUsers` 调用链

```
UserFilter
  ├── 触发: 用户筛选下拉框搜索时调用
  ├── 参数: { appId, dateStart, dateEnd, searchKey?, sources? }
  └── 响应处理: 渲染用户下拉列表（头像+名称+对话数）
```

### `/api/core/app/logs/exportLogs` 调用链

```
LogTable
  ├── 触发: 点击导出按钮
  ├── 参数: { appId, dateStart, dateEnd, sources?, tmbIds?, outLinkUids?, chatSearch?, title, logKeys, sourcesMap, feedbackType?, unreadOnly?, errorFilter? }
  └── 响应处理: 浏览器触发 CSV 文件下载
```

### `/api/core/chat/history/batchDelete` 调用链

```
LogTable
  ├── 触发: 勾选日志 → 点击批量删除 → 确认弹窗确认
  ├── 参数: { appId, chatIds: string[] }
  └── 响应处理: 成功提示 → 刷新日志列表
```

### `/api/core/chat/init` 调用链

```
DetailLogsModal / DetailLogs
  ├── 触发: 点击日志记录打开详情弹窗
  ├── 参数: { appId, chatId, loadCustomFeedbacks }
  └── 响应处理: 初始化 ChatRecordContext → 触发对话记录加载
```

### `/api/core/chat/record/getRecords_v2` 调用链

```
ChatRecordContextProvider
  ├── 触发: 对话详情弹窗内自动加载
  ├── 参数: { chatId, appId, loadCustomFeedbacks, type, includeDeleted?, offset?, pageSize? }
  └── 响应处理: 渲染对话消息列表（用户消息 + AI 回复 + 反馈状态）
```

---

## 后端 API 路由文件索引

| API 路径 | 后端路由文件 | OpenAPI 定义 |
|---------|------------|-------------|
| `/api/core/app/logs/list` | `projects/app/src/pages/api/core/app/logs/list.ts` | `packages/global/openapi/core/app/log/api.ts:119` |
| `/api/core/app/logs/getLogKeys` | `projects/app/src/pages/api/core/app/logs/getLogKeys.ts` | `packages/global/openapi/core/app/log/api.ts:9` |
| `/api/core/app/logs/updateLogKeys` | `projects/app/src/pages/api/core/app/logs/updateLogKeys.ts` | `packages/global/openapi/core/app/log/api.ts:34` |
| `/api/core/app/logs/getUsers` | `projects/app/src/pages/api/core/app/logs/getUsers.ts` | `packages/global/openapi/core/app/log/api.ts:325` |
| `/api/core/app/logs/exportLogs` | `projects/app/src/pages/api/core/app/logs/exportLogs.ts` | `packages/global/openapi/core/app/log/api.ts:178` |
| `/api/core/chat/init` | `projects/app/src/pages/api/core/chat/init.ts` | — |
| `/api/core/chat/record/getRecords_v2` | `projects/app/src/pages/api/core/chat/record/getRecords_v2.ts` | — |
| `/api/core/chat/history/batchDelete` | `projects/app/src/pages/api/core/chat/history/batchDelete.ts` | — |
