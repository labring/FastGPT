---
capability_label: 成员
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:56:58Z"
parent_module: 团队管理
roles:
  - 团队所有者（owner）
  - 团队管理员（hasManagePer）
  - 普通成员
router_paths:
  - /account/team?teamTab=member
---

# 成员 — API索引

## 成员列表查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/member/list` | POST | 分页获取团队成员列表 | `web/support/user/team/api.ts:43` → `MemberTable.tsx:118` | 账户→团队管理→成员→加载时调用；搜索/筛选/翻页时调用 |
| `/proApi/support/user/team/member/count` | GET | 获取团队成员总数 | `web/support/user/team/api.ts:53` → `context.tsx:65` | 账户→团队管理→加载时调用，用于显示团队总人数徽标 |

## 成员管理操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/member/updateNameByManager` | PUT | 管理员修改成员名称 | `web/support/user/team/api.ts:58` → `MemberTable.tsx:172` | 账户→团队管理→成员→点击编辑图标→确认修改时调用 |
| `/proApi/support/user/team/member/delete` | DELETE | 移除/禁用成员 | `web/support/user/team/api.ts:63` → `MemberTable.tsx:151` | 账户→团队管理→成员→点击删除图标→确认移除时调用 |
| `/proApi/support/user/team/member/restore` | POST | 恢复已离开/禁用成员 | `web/support/user/team/api.ts:67` → `MemberTable.tsx:155` | 账户→团队管理→成员→点击恢复图标→确认恢复时调用 |
| `/proApi/support/user/team/member/leave` | DELETE | 退出团队 | `web/support/user/team/api.ts:69` → `MemberTable.tsx:143` | 账户→团队管理→成员→点击退出团队→确认退出时调用 |

## 邀请链接

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/invitationLink/list` | GET | 获取邀请链接列表 | `web/support/user/team/api.ts:76` → `InviteModal.tsx:45` | 账户→团队管理→成员→打开邀请弹窗时调用 |
| `/proApi/support/user/team/invitationLink/create` | POST | 创建邀请链接 | `web/support/user/team/api.ts:73` → `CreateInvitationModal` | 账户→团队管理→成员→邀请弹窗→创建链接时调用 |
| `/proApi/support/user/team/invitationLink/forbid` | PUT | 禁用邀请链接 | `web/support/user/team/api.ts:84` → `InviteModal.tsx:74` | 账户→团队管理→成员→邀请弹窗→禁用链接时调用 |

## 同步与导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/api` | POST | 同步成员数据 | `web/support/user/api.ts:115` → `MemberTable.tsx:137` | 账户→团队管理→成员→点击"立即同步"时调用 |
| `/api/proApi/support/user/team/member/export` | GET | 导出成员为 CSV | 内联 `downloadFetch` → `MemberTable.tsx:258` | 账户→团队管理→成员→点击"导出成员"时调用 |

## 团队所有权

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/changeOwner` | PUT | 转让团队所有权 | `web/support/user/team/api.ts:39` → `TransferOwnershipModal.tsx:67` | 账户→团队管理→成员→转让弹窗→确认转让时调用 |

---

## API 调用链追踪

### `POST /proApi/support/user/team/member/list` 调用链

```
MemberTable (MemberTable.tsx:118)
  ├── 触发: 进入成员列表 / 滚动翻页 / 搜索 / 筛选
  ├── 参数: { pageSize: 20, status, withPermission: true, withOrgs: true, searchKey, offset }
  ├── 响应处理: 更新 members 状态 → 渲染表格行
  ├── 防抖/节流: debounceWait=200ms, throttleWait=500ms
  └── 刷新依赖: [searchKey, status]

TransferOwnershipModal (TransferOwnershipModal.tsx:44)
  ├── 触发: 在转让弹窗中搜索成员
  ├── 参数: { pageSize: 20, searchKey, status: 'active' }
  ├── 响应处理: 过滤掉当前所有者 → 渲染候选成员列表
  └── 防抖/节流: debounceWait=200ms, throttleWait=500ms
```

### `DELETE /proApi/support/user/team/member/delete` 调用链

```
MemberTable (MemberTable.tsx:151)
  ├── 触发: 管理员点击成员行删除图标 → 确认弹窗中确认
  ├── 参数: { tmbId }
  ├── 前置条件: hasManagePer && member.role !== owner && member.tmbId !== userTmbId && member.status === active
  ├── 响应处理: 成功 → 调用 onRefreshMembers() → 刷新成员列表
  └── 错误处理: 默认错误 Toast（useRequest 统一处理）
```

### `POST /proApi/support/user/team/member/restore` 调用链

```
MemberTable (MemberTable.tsx:155)
  ├── 触发: 管理员点击非活跃成员行恢复图标 → 确认弹窗中确认
  ├── 参数: { tmbId }
  ├── 前置条件: hasManagePer && member.status !== active
  ├── 响应处理: 成功 → Toast 提示"操作成功" → 调用 onRefreshMembers()
  └── 错误处理: Toast 提示"拒绝"（common:user.team.invite.Reject）
```

### `PUT /proApi/support/user/team/member/updateNameByManager` 调用链

```
MemberTable (MemberTable.tsx:172)
  ├── 触发: 管理员点击编辑图标 → 编辑弹窗中修改名称并确认
  ├── 参数: { tmbId, name }
  ├── 前置条件: hasManagePer && member.role !== owner && member.tmbId !== userTmbId
  ├── 响应处理: 成功 → 调用 onRefreshMembers() → 列表刷新显示新名称
  └── 错误处理: 弹窗内显示错误状态
```

### `DELETE /proApi/support/user/team/member/leave` 调用链

```
MemberTable (MemberTable.tsx:143)
  ├── 触发: 非所有者普通成员点击"退出团队"→ 确认弹窗中确认
  ├── 参数: 无（基于当前用户 session）
  ├── 前置条件: !isSyncMode && !isWecomTeam && !isOwner
  ├── 响应处理: 成功 → onSwitchTeam(myTeams[0].teamId) → 切换到第一个可用团队
  └── 错误处理: Toast 提示"退出团队失败"（account_team:user_team_leave_team_failed）
```

### `PUT /proApi/support/user/team/changeOwner` 调用链

```
TransferOwnershipModal (TransferOwnershipModal.tsx:67)
  ├── 触发: 所有者在转让弹窗中选择新所有者并确认
  ├── 参数: { userId }
  ├── 前置条件: isOwner && !isSyncMode && isWecomTeam
  ├── 响应处理: 成功 → initUserInfo() 刷新用户权限 → onSwitchTeam 切换到其他团队 → 页面重新加载
  └── 错误处理: Toast 提示"转让失败"（account_team:transfer_failed）
```

### `POST /proApi/support/user/api` (同步成员) 调用链

```
MemberTable (MemberTable.tsx:137)
  ├── 触发: 管理员点击"立即同步"按钮
  ├── 参数: 无
  ├── 前置条件: isSyncMode && hasManagePer
  ├── 响应处理: 成功 → Toast 提示"同步成员成功" → 调用 onRefreshMembers()
  └── 错误处理: Toast 提示"同步成员失败"（account_team:sync_member_failed）
```

### `GET /proApi/support/user/team/invitationLink/list` 调用链

```
InviteModal (InviteModal.tsx:45)
  ├── 触发: 打开邀请弹窗时自动加载
  ├── 参数: 无
  ├── 响应处理: 渲染邀请链接列表表格（描述、过期时间、使用次数、已邀请成员）
  └── 刷新触发: 创建/禁用链接成功后手动调用 refetchInvitationLinkList()
```

### `GET /api/proApi/support/user/team/member/export` 调用链

```
MemberTable (MemberTable.tsx:258) [内联 downloadFetch]
  ├── 触发: 所有者点击"导出成员"按钮
  ├── 参数: URL 路径 + 文件名 = {teamName}-{yyyyMMddHHmmss}.csv
  ├── 前置条件: isSyncMode && isOwner
  └── 响应处理: 浏览器触发文件下载，无需前端解析
```
