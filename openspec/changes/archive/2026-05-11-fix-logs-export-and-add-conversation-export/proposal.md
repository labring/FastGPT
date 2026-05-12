## Why

FastGPT 日志页面的导出功能存在两个问题：1) `projects/app/src/pageComponents/app/detail/Logs/index.tsx` 的导出按钮点击后下载的文件为空数据（仅有表头无数据行）；2) `projects/app/src/pageComponents/app/detail/ConversationLogs/index.tsx` 在 `subTab === 'list'` 时缺少导出按钮，用户无法导出智能客服应用的对话日志列表数据。

## What Changes

- **修复 Logs 页面导出空数据问题**：排查并修复 `/api/core/app/logs/exportLogs` 返回空 CSV 的根因，增强导出流程的错误处理和用户提示
- **ConversationLogs 列表页新增导出按钮**：在 `subTab === 'list'` 时，于 LogFilters 旁边添加与 Logs 页面一致的 `PopoverConfirm` 导出按钮，显示总条数确认弹窗
- **后端原生支持 `feedbackFilter` 参数**：在 `list.ts` 和 `exportLogs.ts` 的 where 子句中消费 `feedbackFilter`（该参数已存在于 Schema 但从未被后端使用），同时修复 ConversationLogs 列表 feedback 筛选不生效的既有 bug
- **统一 `unreadOnly` 参数传递**：修复 LogTable 导出时 `unreadOnly` 参数传递与列表查询不一致的问题（列表查询在 `feedbackType === 'all'` 时传 `undefined`，导出始终传实际值）

## Capabilities

### New Capabilities
- `conversation-logs-export`: ConversationLogs 页面的 `list` 子标签页新增导出功能，支持将筛选后的日志数据导出为 CSV 文件
- `logs-export-fix`: 修复 Logs 页面导出空数据问题，增强导出错误处理

### Modified Capabilities
<!-- No existing capabilities are being modified at spec level -->

## Impact

- **前端文件**:
  - `projects/app/src/pageComponents/app/detail/Logs/LogTable.tsx` — 修复导出参数不一致问题
  - `projects/app/src/pageComponents/app/detail/ConversationLogs/index.tsx` — 新增导出按钮和 `handleExportLogs` 函数（导出逻辑直接放在父组件，不从子组件回调注入）
  - `projects/app/src/pageComponents/app/detail/ConversationLogs/LogList.tsx` — 新增 `onTotalChange` prop，回传 total 给父组件
  - `projects/app/src/pageComponents/app/detail/ConversationLogs/LogFilters.tsx` — 无修改（`LogFiltersType` 已含所需字段）
- **后端文件**:
  - `projects/app/src/pages/api/core/app/logs/exportLogs.ts` — 新增 `feedbackFilter` 消费 + cursor 错误日志
  - `projects/app/src/pages/api/core/app/logs/list.ts` — 新增 `feedbackFilter` 消费（修复既有筛选 bug）
- **API Schema**: `packages/global/openapi/core/app/log/api.ts` — 无修改（`feedbackFilter` 已存在）
- **依赖**: 无新增依赖
