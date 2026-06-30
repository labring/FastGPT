## Why

对话日志页面（日志列表和优化记录）在用户长时间停留在页面后数据可能已过期。用户切换到其他浏览器标签页再切回时，需要手动刷新或切换内部 tab 才能看到最新数据，体验不佳。

## What Changes

- 对话日志页面新增浏览器标签页可见性监听：当用户从其他浏览器标签页切回对话日志页面时，自动刷新当前活跃的子 tab 数据
- `ConversationLogs` 父组件新增 `refreshKey` 状态和 `visibilitychange` 事件监听
- `LogList` 和 `OptimizeRecords` 各自接收 `refreshKey` prop，编入已有的 `refreshDeps` 触发刷新

## Capabilities

### New Capabilities
- `conversation-logs-visibility-refresh`: 浏览器标签页切回对话日志页面时自动刷新当前活跃子 tab 的数据

### Modified Capabilities
<!-- No existing capabilities are modified at spec level -->

## Impact

| 影响范围 | 文件 |
|---------|------|
| 对话日志父组件 | `projects/app/src/pageComponents/app/detail/ConversationLogs/index.tsx` |
| 日志列表 | `projects/app/src/pageComponents/app/detail/ConversationLogs/LogList.tsx` |
| 优化记录 | `projects/app/src/pageComponents/app/detail/ConversationLogs/OptimizeRecords.tsx` |

- 不影响已有 tab 切换行为（条件渲染 → remount → 首次 fetch）
- 不涉及数据模型或 API 变更
- 不影响其他页面

## Non-goals

- 不改变现有内部 tab 切换的刷新逻辑
- 不添加轮询机制
- 不处理其他页面（Dashboard、Publish 等）的 visibility 刷新
