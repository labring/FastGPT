## Context

对话日志页面 (`ConversationLogs`) 是智能客服应用的一部分，在 `SmartCustomerService` 中通过条件渲染展示：

```
currentTab === TabEnum.logs && <ConversationLogs />
```

内部有两个子 tab：日志列表 (`LogList`) 和优化记录 (`OptimizeRecords`)，各自使用独立的 API 和分页 hook (`usePagination` / `useScrollPagination`)，两者都支持 `refreshDeps` 触发数据刷新。

当前切换内部 tab 时组件会 remount → 自动刷新。但浏览器标签页切回时不会触发刷新。

## Goals / Non-Goals

**Goals:**
- 浏览器标签页从不可见变为可见时，自动刷新当前活跃子 tab 的数据
- 复用现有 `refreshDeps` 机制，不引入新的数据流

**Non-Goals:**
- 不改变现有内部 tab 切换的刷新逻辑
- 不添加轮询机制
- 不处理 Dashboard、Publish 等其他 tab 的 visibility 刷新

## Decisions

### Decision 1: 在 `ConversationLogs` 父组件统一管理 visibility 事件

**选择**：`ConversationLogs/index.tsx` 中加 `useEffect` 监听 `visibilitychange`，维护一个 `refreshKey` 计数器向下传递。

**备选方案**：
- 分别在 `LogList` 和 `OptimizeRecords` 内部各自监听 → 放弃。两个子组件各自监听会产生重复的事件绑定，且当前只有活跃子 tab 在 DOM 中，不如父组件统一管理简洁。
- 在 `usePagination` / `useScrollPagination` 通用 hook 中实现 → 放弃。影响面太大，不是所有使用场景都需要此行为。

**理由**：父组件层面只需一份监听逻辑，通过 prop 向下传递刷新信号，两个子组件利用已有的 `refreshDeps` 机制响应。符合最小侵入原则。

### Decision 2: 使用 `refreshKey` 计数器而非布尔标志

**选择**：`useState(0)` 计数器，每次可见时 `setRefreshKey((k) => k + 1)`。

**备选方案**：
- 布尔 `refreshFlag` 切换 → 放弃。连续两次 visibility 变化需要回到 `false` 状态才能再次触发，增加状态管理复杂度。

**理由**：计数器天然支持连续触发，每次递增都是新值，`refreshDeps` 数组检测到变化即触发刷新。

### Decision 3: 使用 `visibilityState` 而非 `focus` 事件

**选择**：`document.addEventListener('visibilitychange', ...)` 检查 `document.visibilityState === 'visible'`。

**备选方案**：
- `window.focus` 事件 → 放弃。不够精确，浏览器窗口内切换标签页不会触发 `focus`。

**理由**：`visibilitychange` 是检测浏览器标签页切换的标准 API，项目中 `chatContext.tsx` 已有相同用法。

## Risks / Trade-offs

- [用户频繁切换浏览器标签页可能导致多余请求]
  → 可接受。`visibilitychange` 触发频率低（人工操作，秒级），与已有的 tab 切换 remount 行为一致。

- [`useScrollPagination` 的 `refreshDeps` 和 `paramsKey` 两套刷新路径可能导致一次 visibility 变化触发两次请求]
  → 低概率。`refreshDeps` 通过 `useRequest` 触发，`paramsKey` 通过 `useEffect` 触发。两者依赖不同（一个看 `refreshDeps` 数组，一个看 `JSON.stringify(params)`），只要 `params` 不变就不会触发 `paramsKey` 路径。当前设计不会引入此问题。
