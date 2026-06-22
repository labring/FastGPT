---
capability_label: 权限管理
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:30:00.000Z"
parent_module: 团队管理
roles:
  - 团队所有者
  - 团队管理员
  - 普通成员
router_paths:
  - "/account/team?teamTab=permission"
---

# 权限管理 — API索引

## 协作者管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/collaborator/list` | GET | 获取团队协作者列表 | `src/web/support/user/team/api.ts:88` → `PermissionManage/index.tsx`（通过 CollaboratorContextProvider） | 权限管理→进入页面时加载；权限管理→修改权限后刷新；权限管理→删除协作者后刷新；权限管理→添加协作者后刷新 |
| `/proApi/support/user/team/collaborator/update` | POST | 批量更新协作者权限 | `src/web/support/user/team/api.ts:90` → `MemberManager/context.tsx`（onUpdateCollaborators） | 权限管理→添加协作者→确认提交时调用 |
| `/proApi/support/user/team/collaborator/updateOne` | PUT | 更新单个协作者权限 | `src/web/support/user/team/api.ts:92` → `PermissionManage/index.tsx:141` | 权限管理→勾选/取消勾选某项权限 Checkbox 时调用 |

## 协作者删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/collaborator/delete` | DELETE | 删除协作者 | `src/web/support/user/team/api.ts:98` → `PermissionManage/index.tsx:155` | 权限管理→点击协作者行删除图标时调用 |

## 搜索

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 通过 GetSearchUserGroupOrg 调用 | 通过通用请求层发起 | 搜索用户、组织、分组 | `src/web/support/user/api.ts` → `PermissionManage/index.tsx:95` | 权限管理→在搜索框输入关键字时调用（500ms 节流 + 200ms 防抖） |

## API 调用链追踪

### `/proApi/support/user/team/collaborator/list` 调用链

```
CollaboratorContextProvider
  ├── 触发: 组件挂载时自动发起 + refreshDeps 变化时重新发起
  ├── 参数: 无
  ├── 条件: feConfigs.isPlus 为 true 时发起，否则返回空列表
  ├── 响应处理: 将 clbs 中每个协作者的 permission 转换为 Permission 实例
  └── 数据分发: 通过 CollaboratorContext 提供给所有子组件

PermissionManage
  ├── 触发: 权限变更/删除成功后由 refetchCollaborators 触发
  ├── 参数: 无
  └── 响应处理: 更新 collaboratorList，tmbList/groupList/orgList 重新分类计算
```

### `/proApi/support/user/team/collaborator/updateOne` 调用链

```
PermissionManage.onUpdatePermission
  ├── 触发: 用户勾选/取消勾选 Checkbox
  ├── 参数: { tmbId?, groupId?, orgId?, permission: 位掩码权限值 }
  ├── 前置计算: TeamPermission.addRole(per) 或 removeRole(per) 计算新权限值
  ├── 前置校验: 查找 collaboratorList 中匹配 id 的协作者，找不到则直接返回
  ├── 成功处理: 调用 refetchCollaborators 刷新列表
  └── 错误处理: useRequest 统一错误处理，Toast 提示错误信息
```

### `/proApi/support/user/team/collaborator/delete` 调用链

```
PermissionManage.onDeleteMemberPermission
  ├── 触发: 用户点击删除图标
  ├── 参数: { tmbId } 或 { groupId } 或 { orgId }（三者互斥）
  ├── 前置条件: hasDeletePer(member.permission) 为 true 且不是删除自己
  │   ├── 团队所有者: 可删除任何人（除自己）
  │   └── 团队管理员: 只能删除无管理权限的协作者
  ├── 成功处理: 调用 refetchCollaborators 刷新列表
  └── 错误处理: useRequest 统一错误处理
```

### 搜索 API（GetSearchUserGroupOrg）调用链

```
PermissionManage (searchKey 状态变化)
  ├── 触发: 用户在搜索框输入文字
  ├── 防抖/节流: throttleWait=500ms, debounceWait=200ms
  ├── 参数: searchKey（用户输入的搜索关键字）
  ├── 响应处理: searchResult 包含 members/groups/orgs 三个数组
  └── 前端过滤: tmbList/groupList/orgList 各自与对应搜索结果取交集
```
