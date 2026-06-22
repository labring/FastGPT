---
capability_label: 用量统计
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T11:18:00.000Z"
parent_module: 账户
roles: ["普通成员", "管理员"]
router_paths: ["/account/usage"]
---

# 用量统计 — API索引

## 用量数据查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/usage/getUsage` | POST | 获取用量明细列表（分页） | `api.ts:11` → `UsageTable.tsx:80` | 用量统计→用量明细→加载时调用；用量统计→用量明细→翻页/切换页码时调用；用量统计→用量明细→筛选条件变更时调用 |
| `/proApi/support/wallet/usage/getDashboardData` | POST | 获取看板趋势数据 | `api.ts:14` → `Dashboard.tsx:30` | 用量统计→用量看板→加载时调用；用量统计→用量看板→筛选条件变更时调用 |

## 用量导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/proApi/support/wallet/usage/exportUsage` | POST | 导出用量数据为 CSV 文件 | `UsageTable.tsx:91`（通过 downloadFetch） | 用量统计→用量明细→点击导出确认后调用 |

## 团队数据查询（辅助）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 内部 getTeamMembers | GET | 获取团队成员列表（滚动分页） | `index.tsx:63`（通过 useScrollPagination） | 用量统计→管理员筛选→展开成员下拉时加载；滚动到底部时加载更多 |
| 内部 getGroupList | GET | 获取团队群组列表 | `index.tsx:90`（通过 useRequest） | 用量统计→管理员筛选→切换到群组模式时加载 |
| 内部 getOrgList | GET | 获取部门树（懒加载） | `OrgTreeSelector.tsx`（通过 useRequest） | 用量统计→管理员筛选→切换到部门模式时加载；展开部门节点时加载子节点 |

---

## API 调用链追踪

### `/proApi/support/wallet/usage/getUsage` 调用链

```
UsageTableList (UsageTable.tsx)
  ├── 触发: 进入用量明细 Tab、翻页、筛选条件变更
  ├── 参数: { dateStart, dateEnd, sources?, memberFilter?, projectName?, pageNum, pageSize=20 }
  ├── 响应处理: 更新 usages 列表 → 渲染表格行；total 用于分页组件和导出确认提示
  └── 错误处理: usePagination 内置加载状态（isLoading），空数据显示 EmptyTip
```

### `/proApi/support/wallet/usage/getDashboardData` 调用链

```
UsageDashboard (Dashboard.tsx)
  ├── 触发: 进入用量看板 Tab、筛选条件变更
  ├── 参数: { dateStart, dateEnd, sources?, memberFilter?, unit: 'day'|'month' }
  ├── 响应处理: 计算 totalUsage/totalInputTokens/totalOutputTokens → 传递给 DashboardChart 渲染折线图
  └── 错误处理: useRequest 内置加载状态（loading），MyBox 显示加载动画
```

### `/api/proApi/support/wallet/usage/exportUsage` 调用链

```
UsageTableList → exportUsage (UsageTable.tsx)
  ├── 触发: 用户点击导出按钮 → PopoverConfirm 确认 → 执行导出
  ├── 参数: { ...requestParams, appNameMap, sourcesMap, title }
  ├── 响应处理: 浏览器下载 CSV 文件（通过 downloadFetch 工具函数）
  └── 错误处理: 默认下载失败提示
```

### `getTeamMembers` 调用链

```
UsageTable 入口页面 (index.tsx)
  ├── 触发: 管理员权限下，展开成员下拉选择器
  ├── 参数: { searchKey? }
  ├── 响应处理: members 列表 → 转换为 tmbList（含头像 + 名称的选项列表）；支持搜索过滤（onSearch 触发 300ms 防抖重查）
  └── 错误处理: useScrollPagination 内置加载和错误状态
```

### `getOrgList` 调用链

```
OrgTreeSelector (OrgTreeSelector.tsx)
  ├── 触发: 管理员切换到部门筛选模式；展开部门节点时懒加载子节点
  ├── 参数: { parentId? }（根节点不传 parentId）
  ├── 响应处理: orgToNode 转换为 rc-tree 所需 TreeNodeData 格式（key, title, children, isLeaf）
  └── 错误处理: useRequest 内置加载状态
```
