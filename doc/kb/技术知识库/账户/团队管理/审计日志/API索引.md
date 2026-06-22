---
capability_label: 审计日志
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T11:00:00.000Z"
parent_module: 团队管理
roles: [团队管理员]
router_paths: ["/account/team?teamTab=audit"]
---

# 审计日志 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/audit/list` | POST | 获取团队审计日志列表 | `projects/app/src/web/support/user/team/operantionLog/api.ts:6` → `projects/app/src/pageComponents/account/team/Audit/index.tsx:83` | 团队管理→审计日志→页面加载时调用；团队管理→审计日志→滚动加载更多时调用；团队管理→审计日志→筛选条件变更时调用 |
| `/proApi/support/user/team/list` | POST | 获取团队成员列表 | `projects/app/src/web/support/user/team/api.ts:43` → `projects/app/src/pageComponents/account/team/Audit/index.tsx:39` | 团队管理→审计日志→成员筛选器初始化时调用；成员筛选器滚动加载更多时调用 |

## API 调用链追踪

### `/proApi/support/user/audit/list` 调用链

```
AuditLog 组件 (index.tsx:83)
  ├── 触发: 页面首次加载 / 滚动到底部 / 筛选条件变更
  ├── 参数:
  │     ├── pageSize: 30
  │     ├── offset: 分页偏移量（由 useScrollPagination 管理）
  │     ├── tmbIds: string[]（成员筛选，全选时不传）
  │     └── events: AuditEventEnum[]（事件类型筛选，全选时不传）
  ├── 依赖: refreshDeps → [searchParams]，searchParams 由 tmbIds 和 events 筛选器变更触发
  └── 响应处理: 返回 PaginationResponse<TeamAuditListItemType>，包含 list（日志列表）和 total（总数）；数据追加到 useScrollPagination 管理的 data 数组中
```

### `/proApi/support/user/team/list` 调用链

```
AuditLog 组件 (index.tsx:39)
  ├── 触发: 组件挂载时自动调用 / 成员筛选器下拉滚动加载
  ├── 参数: 无特殊参数（使用 useScrollPagination 默认分页）
  ├── 依赖: 无 refreshDeps（仅在成员筛选器下拉中触发滚动加载）
  └── 响应处理: 返回成员列表，每个成员含 tmbId、memberName、avatar；映射为筛选器选项 {label: JSX（头像+名称）, value: tmbId}
```
