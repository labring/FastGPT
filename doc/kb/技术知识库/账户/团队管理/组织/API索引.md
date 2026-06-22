---
capability_label: 组织
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 团队管理
roles: [团队管理员, 团队成员]
router_paths: [/account/team?teamTab=org]
---

# 组织 — API索引

## 查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/org/list` | POST | 获取组织子节点列表 | `web/support/user/team/org/api.ts:13` → `useOrg.tsx:48` | 账户→团队管理→组织Tab→加载时调用；账户→团队管理→组织Tab→切换组织时调用；账户→团队管理→组织Tab→搜索时调用 |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/org/create` | POST | 创建子组织 | `web/support/user/team/org/api.ts:19` → `OrgInfoModal.tsx:58` | 账户→团队管理→组织Tab→创建子组织→提交表单时调用 |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/org/update` | PUT | 更新组织信息 | `web/support/user/team/org/api.ts:27` → `OrgInfoModal.tsx:74` | 账户→团队管理→组织Tab→编辑组织→提交修改时调用 |
| `/proApi/support/user/team/org/move` | PUT | 移动组织到新父节点 | `web/support/user/team/org/api.ts:25` → `OrgMoveModal.tsx:24` | 账户→团队管理→组织Tab→移动组织→选择目标后确认时调用 |
| `/proApi/support/user/team/org/updateMembers` | PUT | 更新组织成员列表 | `web/support/user/team/org/api.ts:31` → `OrgMemberManageModal.tsx:72` | 账户→团队管理→组织Tab→管理成员→保存时调用 |

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/org/delete` | DELETE | 删除组织 | `web/support/user/team/org/api.ts:22` → `index.tsx:103` | 账户→团队管理→组织Tab→删除组织→确认后调用 |
| `/proApi/support/user/team/org/deleteMember` | DELETE | 从组织移除成员 | `web/support/user/team/org/api.ts:37` → `index.tsx:118` | 账户→团队管理→组织Tab→成员行→从组织移除→确认后调用 |

## 成员查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/org/members` | GET | 获取组织成员（分页） | `web/support/user/team/org/api.ts:34` → `useOrg.tsx:85`（加载当前组织成员）, `OrgMemberManageModal.tsx:48`（加载管理弹窗中的组织成员）+ `OrgMemberManageModal.tsx:35`（加载全部团队成员） | 账户→团队管理→组织Tab→加载时调用（成员列表）；账户→团队管理→组织Tab→滚动加载更多成员时调用；账户→团队管理→组织Tab→管理成员弹窗→加载全部成员和已有成员时调用 |

> 注：从团队移除成员使用的是 `delRemoveMember`（定义在 `web/support/user/team/api.ts`），路径为 `DELETE /proApi/support/user/team/member/delete`，属于团队核心 API 而非组织专用 API。

## API 调用链追踪

### `/proApi/support/user/team/org/list` 调用链

```
useOrg.tsx (Hook — 组织列表核心逻辑)
  ├── 触发: 页面初始化加载、切换组织、搜索、刷新
  ├── 参数: { orgId, withPermission, searchKey }
  └── 响应处理: 更新 orgs 状态 → 过滤 path !== '' → 渲染表格行；refreshDeps: [teamId, path, currentOrg._id, debouncedSearchKey]
```

### `/proApi/support/user/team/org/create` 调用链

```
OrgInfoModal.tsx (创建弹窗 — 创建模式)
  ├── 触发: 用户填写表单后点击「新建」
  ├── 参数: { name, avatar, orgId=parentId, description }
  └── 响应处理: toast "创建成功" → onClose() → onSuccess() 刷新列表
```

### `/proApi/support/user/team/org/update` 调用链

```
OrgInfoModal.tsx (编辑弹窗 — 编辑模式)
  ├── 触发: 用户修改表单后点击「保存」
  ├── 参数: { orgId, name, avatar, description }
  └── 响应处理: toast "更新成功" → onClose() → onSuccess() 刷新列表；updateCurrentOrg() 即时更新侧边栏
```

### `/proApi/support/user/team/org/move` 调用链

```
OrgMoveModal.tsx (移动弹窗)
  ├── 触发: 用户在组织树中选择目标后点击「确定」
  ├── 参数: { orgId, targetOrgId }
  └── 响应处理: onClose() → onSuccess() 刷新列表
```

### `/proApi/support/user/team/org/delete` 调用链

```
index.tsx (OrgTable — 确认删除弹窗)
  ├── 触发: 用户在确认删除弹窗中点击确认
  ├── 参数: { orgId }
  └── 响应处理: refresh() 刷新组织列表和成员列表
```

### `/proApi/support/user/team/org/updateMembers` 调用链

```
OrgMemberManageModal.tsx (成员管理弹窗)
  ├── 触发: 用户勾选/取消勾选成员后点击「保存」
  ├── 参数: { orgId, members: [{ tmbId }] }
  └── 响应处理: toast "更新成功" → refetchOrgs() → onClose()
```

### `/proApi/support/user/team/org/members` 调用链

```
useOrg.tsx (Hook — 加载当前组织成员)
  ├── 触发: 初始化/切换组织/刷新
  ├── 参数: { orgId, withOrgs=false, withPermission=true, status='active', pageSize=20 }
  └── 响应处理: 滚动分页展示 (MemberScrollData)

OrgMemberManageModal.tsx (管理弹窗 — 双数据源)
  ├── 触发: 打开管理成员弹窗
  ├── 参数(全部团队): { withOrgs=true, withPermission=false, status='active', searchKey, pageSize=20 }
  └── 响应处理: 左侧全部成员列表（支持搜索、滚动加载）
  ├── 参数(当前组织): { orgId, withOrgs=false, withPermission=false, pageSize=100000 }
  └── 响应处理: 右侧已选成员列表（全量加载）
```

### `/proApi/support/user/team/org/deleteMember` 调用链

```
index.tsx (OrgTable — 确认弹窗)
  ├── 触发: 用户在确认弹窗中点击确认
  ├── 参数: { orgId=currentOrg._id, tmbId }
  └── 响应处理: refresh() 刷新列表
```
