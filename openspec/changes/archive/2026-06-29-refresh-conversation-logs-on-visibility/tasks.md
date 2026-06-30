## 1. 父组件添加 visibility 监听

- [x] 1.1 在 `ConversationLogs/index.tsx` 中新增 `refreshKey` state（`useState(0)`）
- [x] 1.2 添加 `useEffect` 监听 `visibilitychange` 事件，`document.visibilityState === 'visible'` 时 `setRefreshKey((k) => k + 1)`
- [x] 1.3 在 `useEffect` cleanup 中移除事件监听
- [x] 1.4 将 `refreshKey` 传递给 `<LogList refreshKey={refreshKey} />` 和 `<OptimizeRecords refreshKey={refreshKey} />`

## 2. 子组件接收 refreshKey 并编入 refreshDeps

- [x] 2.1 `LogList.tsx` 接口新增 `refreshKey?: number` prop
- [x] 2.2 `LogList.tsx` 的 `usePagination` 将 `refreshDeps: [params]` 改为 `refreshDeps: [params, refreshKey]`
- [x] 2.3 `OptimizeRecords.tsx` 接口新增 `refreshKey?: number` prop
- [x] 2.4 `OptimizeRecords.tsx` 的 `useScrollPagination` 将 `refreshDeps: [appId, dateRange]` 改为 `refreshDeps: [appId, dateRange, refreshKey]`

## 3. 验证

- [ ] 3.1 确认切换浏览器标签页再切回时，日志列表自动刷新
- [ ] 3.2 确认切换浏览器标签页再切回时，优化记录自动刷新
- [ ] 3.3 确认内部 tab 切换（dashboard ↔ logs）行为不变
- [ ] 3.4 确认子 tab 切换（日志详情 ↔ 优化记录）行为不变
