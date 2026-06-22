---
capability_label: dashboard
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 用量统计
roles: [团队管理员, 团队成员]
router_paths: [/account/usage?usageTab=dashboard]
---

# 用量看板 — API索引

## 查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/usage/getDashboardData` | POST | 获取用量看板趋势数据（每日积分和Token消耗） | `src/web/support/wallet/usage/api.ts:14` → `src/pageComponents/account/usage/Dashboard.tsx:31` | 账户→用量统计→看板Tab→页面加载时自动调用；账户→用量统计→看板Tab→筛选器变化时自动刷新调用 |

### `/proApi/support/wallet/usage/getDashboardData` 调用链

```
UsageDashboard (Dashboard.tsx:30)
  ├── 触发: 页面加载时自动请求（manual: false）
  ├── 触发: filterParams 变化时自动刷新（refreshDeps: [filterParams]）
  ├── 参数:
  │   ├── dateStart: 日期范围起始（ISO格式），默认最近7天
  │   ├── dateEnd: 日期范围结束（ISO格式），默认当天+1天
  │   ├── sources: UsageSourceEnum[]，筛选用量来源，全选时为 undefined
  │   ├── memberFilter: { type: 'member'|'group'|'org', ...ids }，全选时为 undefined
  │   └── unit: 'day' | 'month'，统计聚合单位
  ├── 响应处理:
  │   ├── 成功: 格式化 date 字段为 YYYY-MM-DD → 存入 totalPoints state
  │   └── 计算: totalUsage = ΣtotalPoints, totalInputTokens = ΣinputTokens, totalOutputTokens = ΣoutputTokens
  └── 错误处理: useRequest 内部处理，图表区域处于加载失败状态
```
