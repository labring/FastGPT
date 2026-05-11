## 1. Logs 页面导出修复

- [x] 1.1 修复 LogTable 导出函数中 `unreadOnly` 参数与列表查询不一致的问题：当 `feedbackType === 'all'` 时传 `undefined`
- [x] 1.2 在 `exportLogs.ts` API handler 的 cursor error 事件中添加详细日志（appId、query 条件、错误信息）
- [x] 1.3 为 LogTable 的 `exportLogs` 函数添加 `errorToast`，在导出失败时提示用户
- [x] 1.4 修复 `exportLogs.ts` 聚合管道中 `$lookup` 语法错误：`localField`/`foreignField` 与 `pipeline` 混用导致 MongoDB `FailedToParse` 错误，改为纯管道模式（`let` + `$expr`）

## 2. 后端 `feedbackFilter` 参数支持

- [x] 2.1 在 `list.ts` 的 where 子句中新增 `feedbackFilter` 消费逻辑（按 design.md D3 映射表），使其与 `feedbackType` 独立并行工作
- [x] 2.2 在 `exportLogs.ts` 的 where 子句中新增相同的 `feedbackFilter` 消费逻辑
- [x] 2.3 在 `list.ts` 和 `exportLogs.ts` 中从 `GetAppChatLogsBodySchema.parse()` / `ExportChatLogsBodySchema.parse()` 解构出 `feedbackFilter` 参数

## 3. ConversationLogs 列表导出按钮

- [x] 3.1 在 ConversationLogs 父组件中直接实现 `handleExportLogs` 函数：直接读取 `logFilters` state → 构造参数 → `downloadFetch('/api/core/app/logs/exportLogs', ...)`（不再从 LogList 通过回调注入）
- [x] 3.2 在 ConversationLogs 的 `SubTabHeader` 中，当 `subTab === 'list'` 时渲染 `PopoverConfirm` 导出按钮（放在 LogFilters 旁边）
- [x] 3.3 导出按钮使用 `app:logs_export_confirm_tip` 显示 `{ total }`，`onConfirm` 直接指向 `handleExportLogs`

## 4. LogList total 状态回传

- [x] 4.1 在 LogList 组件中新增 `onTotalChange` prop，当 `total` 变化时回调父组件
- [x] 4.2 在 ConversationLogs 父组件中接收 total 并存入 `exportTotal` state

## 5. 验证

- [x] 5.1 验证 Logs 页面：设置筛选条件 → 表格有数据 → 点击导出 → 下载的 CSV 文件包含数据行（浏览器实测）
- [x] 5.2 验证 ConversationLogs 列表页：设置筛选条件（含 feedback 筛选）→ 表格数据正确 → 确认导出弹窗显示正确 total → 点击确认 → 下载 CSV（浏览器实测）
- [x] 5.3 验证 ConversationLogs optimize 标签页的导出按钮不受影响（代码未修改 optimize tab 相关逻辑）
- [x] 5.4 验证 Logs 页面导出按钮在 feedbackType 为不同值时的行为一致性（unreadOnly 修复确保参数一致）
- [x] 5.5 验证 `feedbackFilter` 参数在 list API 中独立生效，不影响 Logs 页面通过 `feedbackType` 的筛选（两套参数通过 `!feedbackType` 条件互斥）
- [x] 5.6 运行 lint 检查：所有修改文件均无 ESLint 错误
- [x] 5.7 确认 `$lookup` 语法错误已修复：`exportLogs.ts`中无其他 `localField`/`foreignField` + `pipeline` 混用，代码库中无类似问题
