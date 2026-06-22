---
capability_label: 分组
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 团队管理
roles: ["team_owner", "team_admin", "group_owner", "group_admin", "group_member"]
router_paths: ["/account/team?teamTab=group"]
---

# 分组 — API索引

## 分组查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/group/list` | POST | 获取团队分组列表（含成员信息） | `web/support/user/team/group/api.ts:12` → `pageComponents/account/team/GroupManage/index.tsx:43` | 团队管理→分组Tab→切换Tab时调用；团队管理→分组Tab→团队切换时自动刷新 |

## 分组管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/group/create` | POST | 创建新分组 | `web/support/user/team/group/api.ts:14` → `pageComponents/account/team/GroupManage/GroupInfoModal.tsx:48` | 团队管理→分组Tab→创建分组→提交表单时调用 |
| `/proApi/support/user/team/group/update` | PUT | 更新分组信息或成员列表 | `web/support/user/team/group/api.ts:20` → `pageComponents/account/team/GroupManage/GroupInfoModal.tsx:61`<br>`web/support/user/team/group/api.ts:20` → `pageComponents/account/team/GroupManage/GroupManageMember.tsx:99` | 团队管理→分组Tab→编辑分组信息→保存时调用；团队管理→分组Tab→管理分组成员→保存变更时调用 |
| `/proApi/support/user/team/group/delete` | DELETE | 删除分组 | `web/support/user/team/group/api.ts:17` → `pageComponents/account/team/GroupManage/index.tsx:64` | 团队管理→分组Tab→删除分组→确认删除时调用 |
| `/proApi/support/user/team/group/changeOwner` | PUT | 转让分组负责人 | `web/support/user/team/group/api.ts:26` → `pageComponents/account/team/GroupManage/GroupTransferOwnerModal.tsx:72` | 团队管理→分组Tab→转让负责人→确认转让时调用 |

## 成员查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/members` | GET | 分页查询团队成员列表 | `web/support/user/team/api.ts` → `pageComponents/account/team/GroupManage/GroupManageMember.tsx:52`<br>`web/support/user/team/api.ts` → `pageComponents/account/team/GroupManage/GroupTransferOwnerModal.tsx:46` | 团队管理→分组Tab→管理分组成员→加载可选成员列表时调用（含搜索/翻页）；团队管理→分组Tab→转让负责人→搜索新负责人时调用 |

## API 调用链追踪

### `/proApi/support/user/team/group/list` 调用链

```
MemberTable (GroupManage/index.tsx)
  ├── 触发: 组件挂载（manual: false）或 teamId 变更（refreshDeps）
  ├── 参数: { withMembers: true }
  └── 响应处理: 更新 groups 状态，默认分组名替换为团队名称渲染列表

usage/index.tsx
  ├── 触发: 用量统计页面加载
  └── 参数: 不带 withMembers（默认）

MemberManager/MemberModal.tsx
  ├── 触发: 协作权限管理弹窗中获取分组列表
  └── 参数: 不带 withMembers（默认）
```

### `/proApi/support/user/team/group/create` 调用链

```
GroupInfoModal
  ├── 触发: 用户在创建弹窗中点击"新建"按钮
  ├── 参数: { name, avatar }
  └── 响应处理: 成功后并行执行 onClose() 和 onSuccess()（刷新列表）
```

### `/proApi/support/user/team/group/update` 调用链

```
GroupInfoModal
  ├── 触发: 用户在编辑弹窗中点击"保存"按钮
  ├── 参数: { groupId, name, avatar }
  └── 响应处理: 成功后并行执行 onClose() 和 onSuccess()（刷新列表）

GroupEditModal (GroupManageMember.tsx)
  ├── 触发: 用户在成员管理弹窗中点击"保存"按钮
  ├── 参数: { groupId, memberList: [{ tmbId, role }] }
  └── 响应处理: 成功后并行执行 onClose() 和 onSuccess()（刷新列表）
```

### `/proApi/support/user/team/group/delete` 调用链

```
MemberTable (GroupManage/index.tsx)
  ├── 触发: 用户在删除确认弹窗中点击确认
  ├── 参数: { groupId }
  └── 响应处理: 成功后执行 refetchGroups() 刷新列表
```

### `/proApi/support/user/team/group/changeOwner` 调用链

```
ChangeOwnerModal (GroupTransferOwnerModal.tsx)
  ├── 触发: 用户在转让弹窗中点击"确认"按钮
  ├── 参数: groupId, tmbId（新负责人的团队会员ID）
  └── 响应处理: 成功 Toast "转让负责人成功"，失败 Toast "转让负责人失败"
```

### `/proApi/support/user/team/members` 调用链

```
GroupEditModal (GroupManageMember.tsx) — 可选成员列表
  ├── 触发: 弹窗打开时首次加载、搜索输入变更、滚动到底部
  ├── 参数: { status: 'active', pageSize: 20, searchKey, 分页游标 }
  └── 响应处理: 追加/替换成员列表，渲染 MemberItemCard 复选框列表

GroupEditModal (GroupManageMember.tsx) — 已选成员列表
  ├── 触发: 弹窗打开时加载
  ├── 参数: { groupId, pageSize: 100000 }
  └── 响应处理: 设置 selected 状态，初始化右侧已选列表

ChangeOwnerModal (GroupTransferOwnerModal.tsx)
  ├── 触发: 搜索输入变更、滚动到底部
  ├── 参数: { searchKey, pageSize: 20, 分页游标 }
  └── 响应处理: 渲染可选成员下拉列表
```
