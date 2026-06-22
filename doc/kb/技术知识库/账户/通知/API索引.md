---
capability_label: 通知
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles:
  - 所有登录用户（Plus版）
  - 个人账户用户
  - 团队账户用户
router_paths:
  - /account/inform
---

# 通知 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/inform/list` | POST | 分页查询通知列表 | `web/support/user/inform/api.ts:6` → `pages/account/inform.tsx:38` | 账户→通知列表→首次加载时调用；账户→通知列表→翻页/切换每页条数时调用 |
| `/proApi/support/user/inform/countUnread` | GET | 获取未读通知数量及重要通知列表 | `web/support/user/inform/api.ts:9` → `components/Layout/index.tsx:103` | 全局→Layout→30秒轮询调用；返回未读数和重要通知用于导航角标和全局浮层 |

## 更新/标记

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/inform/read` | GET | 标记指定通知为已读 | `web/support/user/inform/api.ts:14` → `pages/account/inform.tsx:82`<br>`web/support/user/inform/api.ts:14` → `components/support/user/inform/ImportantInform.tsx:18` | 账户→通知列表→点击未读通知时调用（标记后刷新列表）；全局→重要通知浮层→点击关闭按钮时调用（标记后刷新未读数） |

## API 调用链追踪

### `/proApi/support/user/inform/list` 调用链

```
InformTable (pages/account/inform.tsx)
  ├── 触发: 页面挂载时首次加载 / 用户点击翻页 / 切换每页条数
  ├── 参数: { pageNum: number, pageSize: number }
  ├── 响应: PaginationResponse<UserInformType>，包含 list 数组和 total 总数
  └── 响应处理: list 渲染为通知卡片列表；total 用于分页器显示总条数；加载失败时显示错误 Toast
```

### `/proApi/support/user/inform/countUnread` 调用链

```
Layout (components/Layout/index.tsx)
  ├── 触发: 每 30 秒自动轮询（refetchInterval: 30000）
  ├── 参数: 无
  ├── 响应: { unReadCount: number, importantInforms: UserInformType[] }
  └── 响应处理: unReadCount 传给 Navbar 组件显示角标；importantInforms 传给 ImportantInform 组件展示全局浮层
```

### `/proApi/support/user/inform/read` 调用链

```
InformTable (pages/account/inform.tsx)
  ├── 触发: 用户点击未读通知卡片
  ├── 参数: { id: string } — 通知ID
  └── 响应处理: 成功后调用 getData(pageNum) 重新加载当前页，红点状态更新

ImportantInform (components/support/user/inform/ImportantInform.tsx)
  ├── 触发: 用户点击重要通知浮层的关闭按钮
  ├── 参数: (id: string) — 通知ID
  ├── 错误提示: "Failed to read the inform"
  └── 响应处理: 成功后调用 refetch() 刷新未读数和重要通知列表
```
