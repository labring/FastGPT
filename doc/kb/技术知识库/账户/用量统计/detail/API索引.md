---
capability_label: detail
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T11:30:00.000Z"
parent_module: 用量统计
roles: ["team_member", "team_admin"]
router_paths: ["/account/usage?usageTab=detail"]
---

# detail — API索引

## 用量数据查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/usage/getUsage` | POST | 分页获取用量记录列表 | `web/support/wallet/usage/api.ts:12` → `pageComponents/account/usage/UsageTable.tsx:80` | 账户→用量统计→用量明细→加载时调用；账户→用量统计→用量明细→筛选条件变更时调用；账户→用量统计→用量明细→翻页时调用 |

### `/proApi/support/wallet/usage/getUsage` 调用链

```
UsageTableList 组件
  ├── 触发: 组件挂载、筛选条件变更、翻页
  ├── 参数: { dateStart, dateEnd, sources?, memberFilter?, projectName?, pageSize, pageNum }
  ├── 通过: usePagination Hook (pageSize=20, scrollContainerRef)
  ├── 响应处理: 数据存入 usages 数组 + total 总数，驱动表格渲染和分页控件
  └── 错误处理: usePagination 内置错误处理

依赖触发:
  dateRange.from / dateRange.to → dateStart / dateEnd（dayjs 格式化）
  usageSources → sources（isSelectAllSource 为 true 时不传）
  memberFilter → 成员/部门/群组筛选对象（isSelectAllTmb 为 true 时不传）
  projectName → 项目名称模糊匹配（300ms 防抖）
```

## 数据导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/proApi/support/wallet/usage/exportUsage` | POST | 导出用量记录为 CSV 文件 | `pageComponents/account/usage/UsageTable.tsx:91` | 账户→用量统计→用量明细→点击导出→确认后调用 |

### `/api/proApi/support/wallet/usage/exportUsage` 调用链

```
UsageTableList 组件 → PopoverConfirm 确认弹窗
  ├── 触发: 用户点击导出按钮 → 确认弹窗中点击确认
  ├── 参数: { ...requestParams (筛选参数), appNameMap, sourcesMap, title }
  ├── 通过: downloadFetch (通用文件下载函数)
  ├── 文件名: usage.csv
  ├── appNameMap: 应用名称的 i18n key → 翻译后文本映射
  ├── sourcesMap: 来源枚举 key → { label: 翻译后文本 } 映射
  └── 错误处理: downloadFetch 内置错误处理
```

## 成员搜索

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/getMembers` | GET（由 useScrollPagination 内部请求） | 搜索团队成员列表 | `pages/account/usage/index.tsx:63`（父页面） → `UsageTableList` 通过 props 接收 | 账户→用量统计→筛选模式为「成员」→搜索成员时调用 |

## 群组列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/group/getGroupList` | GET（由 useRequest 内部请求） | 获取团队群组列表 | `pages/account/usage/index.tsx:91`（父页面） → `UsageTableList` 通过 props 接收 | 账户→用量统计→页面加载时调用（仅管理员可见） |
