---
capability_label: 成员
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T10:56:58Z"
parent_module: 团队管理
roles:
  - 团队所有者（owner）
  - 团队管理员（hasManagePer）
  - 普通成员
router_paths:
  - /account/team?teamTab=member
---

# 成员 — Store 数据流

## Store 概览

| Store / Context | 来源 | 用途 |
|-----------|------|------|
| `TeamContext` | `pageComponents/account/team/context.tsx` | 团队列表、团队切换、成员总数、编辑团队数据等共享状态 |
| `useUserStore` | `@/web/support/user/useUserStore` | 当前用户信息、团队权限、订阅计划状态 |
| `useSystemStore` | `@/web/common/system/useSystemStore` | 系统配置（注册方式、功能开关、订阅计划内容） |

> `TeamContext` 由父级 `TeamModalContextProvider` 包裹整个团队管理页面，成员 Tab 通过 `useContextSelector(TeamContext, ...)` 按需订阅。

---

## TeamContext

### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `myTeams` | `TeamTmbItemType[]` | 当前用户所属的全部团队列表 |
| `isLoading` | `boolean` | 团队列表或切换操作加载状态 |
| `teamSize` | `number` | 当前团队的成员总数（来自 getTeamMemberCount） |
| `editTeamData` | `EditTeamFormDataType \| undefined` | 编辑团队信息的表单数据 |

### Actions

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `onSwitchTeam` | `teamId: string` | 切换到指定团队并重新加载页面 | `PUT /proApi/support/user/team/switch` |
| `refetchTeams` | — | 重新获取团队列表 | `GET /proApi/support/user/team/list` |
| `refetchTeamSize` | — | 刷新当前团队成员总数 | `GET /proApi/support/user/team/member/count` |
| `setEditTeamData` | `EditTeamFormDataType \| undefined` | 设置编辑团队弹窗的数据 | — |

---

## useUserStore（Zustand）

> 成员模块消费的 `useUserStore` 关键字段：

### State（消费部分）

| 字段 | 类型 | 说明 |
|------|------|------|
| `userInfo` | `UserType` | 包含 `team`（团队 ID/名称/头像/角色/权限/是否企业微信团队）、`_id`（用户 ID） |
| `userInfo.team.permission` | `TeamPermission` | 团队权限对象，含 `hasManagePer`（管理权限）、`isOwner`（所有者） |
| `userInfo.team.tmbId` | `string` | 当前用户在团队中的成员 ID |
| `teamPlanStatus` | `ClientTeamPlanStatusType` | 团队订阅计划状态（影响审计日志功能可用性） |

### Actions（消费部分）

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `initUserInfo` | — | 重新初始化用户信息（所有权转让后调用） | 内部调用用户信息接口 |

---

## useSystemStore（Zustand）

> 成员模块消费的 `useSystemStore` 关键字段：

### State（消费部分）

| 字段 | 类型 | 说明 |
|------|------|------|
| `feConfigs` | `SystemConfigType` | 系统配置，含 `register_method`（注册方式，决定 isSyncMode）、`show_team_chat`（是否显示团队聊天/标签同步）、`systemTitle`（系统名称） |
| `subPlans` | `SubPlanType` | 订阅计划内容，含 `standard[currentSubLevel].auditLogStoreDuration`（审计日志存储时长） |

---

## 数据流向

### 成员列表加载流程

```
MemberTable                    TeamContext              useUserStore           API
   │                               │                        │                   │
   │  useContextSelector           │                        │                   │
   │  → myTeams, teamSize,         │                        │                   │
   │    onSwitchTeam               │                        │                   │
   │                               │                        │                   │
   │  useUserStore()               │                        │                   │
   │  → userInfo, initUserInfo     │                        │                   │
   │                               │                        │                   │
   │  useSystemStore()             │                        │                   │
   │  → feConfigs                  │                        │                   │
   │                               │                        │                   │
   │  isSyncMode =                 │                        │                   │
   │  feConfigs.register_method    │                        │                   │
   │  .includes('sync')            │                        │                   │
   │                               │                        │                   │
   │  useScrollPagination(         │                        │                   │
   │    getTeamMembers, {...})     │                        │                   │
   ├──────────────────────────────────────────────────────►│                   │
   │                                                       │  POST /member/list│
   │                                                       ├──────────────────►│
   │                                                       │◄──────────────────┤
   │  members = [...]             │                        │                   │
   │  loadingMembers = false      │                        │                   │
   │◄─────────────────────────────┤                        │                   │
   │                               │                        │                   │
   │  渲染表格:                    │                        │                   │
   │  - 按钮可见性由 userInfo      │                        │                   │
   │    .team.permission 控制      │                        │                   │
   │  - 按钮可见性由 isSyncMode    │                        │                   │
   │    控制（同步/邀请等按钮）     │                        │                   │
```

### 退出团队流程

```
MemberTable                    TeamContext              API
   │                               │                      │
   │  点击"退出团队" → 确认       │                      │
   ├──────────────────────────────►│                      │
   │                               │  DELETE /member/leave│
   │                               ├─────────────────────►│
   │                               │◄─────────────────────┤
   │                               │                      │
   │  onSwitchTeam(myTeams[0])     │                      │
   │◄──────────────────────────────┤                      │
   │                               │  PUT /team/switch    │
   │                               ├─────────────────────►│
   │                               │◄─────────────────────┤
   │  router.reload()              │                      │
   │◄──────────────────────────────┤                      │
```

### 所有权转让流程

```
TransferOwnershipModal        useUserStore         TeamContext          API
   │                               │                    │                │
   │  搜索并选择新所有者            │                    │                │
   │  确认转让                      │                    │                │
   ├──────────────────────────────►│                    │                │
   │                               │  PUT /changeOwner  │                │
   │                               ├───────────────────────────────────►│
   │                               │◄───────────────────────────────────┤
   │                               │                    │                │
   │  initUserInfo()               │                    │                │
   │◄──────────────────────────────┤                    │                │
   │                               │                    │                │
   │  onSwitchTeam(otherTeamId) ──►│                    │                │
   │                               │  PUT /team/switch  │                │
   │                               ├───────────────────►│                │
   │                               │◄───────────────────┤                │
   │  onSuccess() → 页面重新加载    │                    │                │
```

---

## 组件间通信模式

| 通信模式 | 场景 | 涉及组件 |
|---------|------|---------|
| Context 共享状态 | 团队列表、团队切换、成员计数在团队管理各 Tab 间共享 | `TeamModalContextProvider` → `MemberTable` / `OrgManage` / `GroupManage` 等 |
| Zustand Store 共享 | 用户信息和权限在全局共享，驱动 UI 条件渲染 | `useUserStore` → `MemberTable`；`useSystemStore` → `MemberTable` |
| 路由参数 | `teamTab=member` 决定渲染哪个子组件 | `team/index.tsx` → `MemberTable` |
| 父子 Props | 父级将 Tab 切换栏作为 Props 传入子组件 | `team/index.tsx` → `MemberTable({ Tabs })` |
| Props 回调 | 弹窗通过 onClose/onSuccess 回调与父组件通信 | `MemberTable` → `InviteModal` / `TransferOwnershipModal` |
