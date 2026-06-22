---
capability_label: 团队管理
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:55:00.000Z"
parent_module: 账户
roles: [团队所有者, 团队管理员, 普通成员]
router_paths: [/account/team]
---

# 团队管理 — API 索引

## 团队信息查询与切换

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/list` | GET | 获取当前用户已加入的活跃团队列表 | `api.ts:32` → `context.tsx:60`, `TeamSelector.tsx:27` | 账户→团队管理→加载时调用（获取团队列表和团队切换选项） |
| `/proApi/support/user/team/member/count` | GET | 获取当前团队的成员总数 | `api.ts:53` → `context.tsx:65` | 账户→团队管理→加载时调用（页面头部显示成员统计） |
| `/proApi/support/user/team/switch` | PUT | 切换当前活跃团队 | `api.ts:37` → `context.tsx:71`, `TeamSelector.tsx:32` | 账户→团队管理→切换团队下拉选择时调用；账户→各页面→TeamSelector 切换时调用 |
| `/support/user/team/update` | PUT | 更新团队基本信息（名称/头像/通知账号） | `api.ts:36` → `EditInfoModal`（动态导入） | 账户→团队管理→编辑团队信息弹窗→提交时调用 |

## 成员管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/member/list` | POST | 分页获取团队成员列表 | `api.ts:43` → `MemberTable.tsx:118`, `Audit/index.tsx:39`, `GroupManageMember.tsx`, `ChangeOwnerModal`, `TransferOwnershipModal` 等 | 账户→团队管理→成员Tab→加载/搜索/翻页时调用；审计日志→获取成员筛选选项时调用 |
| `/proApi/support/user/team/member/updateNameByManager` | PUT | 管理员修改成员名称 | `api.ts:58` → `MemberTable.tsx:172` | 账户→团队管理→成员Tab→编辑成员名称→提交时调用 |
| `/proApi/support/user/team/member/delete` | DELETE | 移除/禁用团队成员 | `api.ts:63` → `MemberTable.tsx:152`, `OrgManage/index.tsx` | 账户→团队管理→成员Tab→移除成员确认后调用；组织管理→移除成员时调用 |
| `/proApi/support/user/team/member/restore` | POST | 恢复已禁用的成员 | `api.ts:67` → `MemberTable.tsx:156` | 账户→团队管理→成员Tab→恢复已禁用成员确认后调用 |
| `/proApi/support/user/team/member/leave` | DELETE | 用户主动退出团队 | `api.ts:69` → `MemberTable.tsx:143` | 账户→团队管理→成员Tab→非管理员点击"退出团队"确认后调用 |
| `/proApi/support/user/sync` | POST | 同步模式下手动同步团队成员 | `user/api.ts:115` → `MemberTable.tsx:137` | 账户→团队管理→成员Tab→同步模式下管理员点击"立即同步"时调用 |

## 邀请链接

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/invitationLink/create` | POST | 创建团队邀请链接 | `api.ts:73` → `InviteModal.tsx` | 账户→团队管理→成员Tab→邀请成员弹窗→创建邀请链接时调用 |
| `/proApi/support/user/team/invitationLink/list` | GET | 获取团队邀请链接列表 | `api.ts:76` → `InviteModal.tsx` | 账户→团队管理→成员Tab→邀请成员弹窗→加载时调用 |
| `/proApi/support/user/team/invitationLink/accept` | POST | 接受团队邀请 | `api.ts:79` → `HandleInviteModal.tsx`, `provider.tsx:51` | 账户→团队管理→邀请弹窗→点击接受时调用；OAuth 登录后的邀请自动接受 |
| `/proApi/support/user/team/invitationLink/info` | GET | 获取邀请链接详情 | `api.ts:82` → `HandleInviteModal.tsx` | 账户→团队管理→邀请弹窗→加载时获取邀请信息 |
| `/proApi/support/user/team/invitationLink/forbid` | PUT | 禁用邀请链接 | `api.ts:84` → `InviteModal.tsx` | 账户→团队管理→成员Tab→邀请弹窗→禁用某条邀请链接时调用 |

## 权限管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/collaborator/list` | GET | 获取团队成员/组织/分组的权限列表 | `api.ts:88` → `PermissionManage/index.tsx:544` | 账户→团队管理→权限Tab→加载时调用 |
| `/proApi/support/user/team/collaborator/updateOne` | PUT | 更新单个成员/组织/分组的权限 | `api.ts:97` → `PermissionManage/index.tsx:141` | 账户→团队管理→权限Tab→勾选/取消权限复选框时调用 |
| `/proApi/support/user/team/collaborator/update` | POST | 批量更新权限协作者 | `api.ts:90` → `PermissionManage`（通过 CollaboratorContext） | 账户→团队管理→权限Tab→添加协作者时调用 |
| `/proApi/support/user/team/collaborator/delete` | DELETE | 删除权限协作者 | `api.ts:98` → `PermissionManage`（通过 CollaboratorContext） | 账户→团队管理→权限Tab→删除协作者时调用 |

## 团队转让

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/changeOwner` | PUT | 转让团队所有权 | `api.ts:39` → `TransferOwnershipModal.tsx` | 账户→团队管理→成员Tab→所有权转让弹窗→确认转让时调用 |

## API 调用链追踪

### `/proApi/support/user/team/list` 调用链

```
TeamModalContextProvider (context.tsx)
  ├── 触发: 用户信息加载完成（refreshDeps: [userInfo?._id]）
  ├── 参数: { status: 'active' }
  └── 响应处理: 存储到 myTeams，供团队下拉选择器和页面头部渲染

TeamSelector (TeamSelector.tsx)
  ├── 触发: 组件挂载、userInfo 变化
  ├── 参数: { status: 'active' }
  └── 响应处理: 格式化为下拉选择器的选项列表（icon/avatar + teamName + teamId）
```

### `/proApi/support/user/team/member/count` 调用链

```
TeamModalContextProvider (context.tsx)
  ├── 触发: 团队切换后（refreshDeps: [userInfo?.team?.teamId]）
  ├── 参数: 无额外参数
  └── 响应处理: 提取 count 字段，渲染为页面头部"共 N 位成员"标签
```

### `/proApi/support/user/team/switch` 调用链

```
TeamModalContextProvider (context.tsx)
  ├── 触发: 用户调用 onSwitchTeam(teamId)
  ├── 参数: { teamId: string }
  └── 响应处理: 成功→initUserInfo()→router.reload()；失败→toast 提示"切换团队失败"

TeamSelector (TeamSelector.tsx)
  ├── 触发: 用户在下拉菜单中点击非管理项
  ├── 参数: { teamId: string }
  └── 响应处理: 成功→router.reload()；全局 Loading 在请求前后分别开关
```
