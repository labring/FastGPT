---
capability_label: 组织
doc_type: "16"
doc_label: Hooks工具函数
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 团队管理
roles: [团队管理员, 团队成员]
router_paths: [/account/team?teamTab=org]
---

# 组织 — Hooks工具函数

## Hooks / Composables

### `useOrg`

- **签名**: `function useOrg({ withPermission }: { withPermission?: boolean }): { orgStack, currentOrg, orgs, isLoading, paths, onClickOrg, members, MemberScrollData, onPathClick, refresh, updateCurrentOrg, searchKey, setSearchKey, debouncedSearchKey }`
- **用途**: 组织管理的核心状态管理 Hook，管理组织层级堆栈、当前选中组织、子组织列表加载、成员分页查询、面包屑路径、搜索过滤等全部状态与操作
- **是否对外共享**: 是
- **被以下模块引用**: 权限-成员管理（MemberManager/MemberModal）、组织移动弹窗（OrgMoveModal — 内部引用）

**主要能力说明**：

| 能力 | 返回值/操作 | 说明 |
|------|-----------|------|
| 组织堆栈管理 | `orgStack`, `currentOrg`, `onClickOrg`, `onPathClick` | 以堆栈方式管理组织层级导航，支持前进（点击进入）和后退（面包屑返回） |
| 子组织列表 | `orgs`, `isLoading` | 基于 `currentOrg._id` 自动加载子组织列表，支持搜索过滤（300ms 防抖）和权限控制 |
| 成员分页 | `members`, `MemberScrollData` | 滚动分页加载当前组织直属成员，每页 20 条，支持 `status='active'` 过滤 |
| 路径导航 | `paths` | 生成面包屑路径数据（`ParentTreePathItemType[]`），从组织栈计算 |
| 数据刷新 | `refresh` | 同时刷新组织列表（`refetchOrgs`）和成员列表（`refetchMembers`） |
| 搜索 | `searchKey`, `setSearchKey`, `debouncedSearchKey` | 300ms 防抖搜索，搜索模式下隐藏面包屑和成员列表，点击结果后清空搜索 |
| 即时更新 | `updateCurrentOrg` | 编辑组织后无需等待刷新，直接更新当前组织栈中的名称、描述和头像 |

**内部依赖**：
- `getOrgList` API — 查询子组织列表
- `getOrgMembers` API — 查询组织成员（分页）
- `getTeamMembers` API — 查询团队成员（用于当前组织的成员滚动分页）
- `useUserStore` — 获取团队信息（根组织名和头像）
- `useScrollPagination` — 成员列表滚动分页
- `useRequest` — 子组织列表请求管理
- `useDebounce` — 搜索防抖

## 工具函数

本模块的工具函数定义在全局包中：

| 文件 | 导出项 | 类型 | 说明 |
|------|--------|------|------|
| `packages/global/support/user/team/org/constant.ts` | `getOrgChildrenPath` | `function (org: OrgSchemaType): string` | 根据组织的 path 和 pathId 计算子路径前缀 |
| `packages/global/support/user/team/org/constant.ts` | `OrgCollectionName` | `string = 'team_orgs'` | MongoDB 组织集合名 |
| `packages/global/support/user/team/org/constant.ts` | `OrgMemberCollectionName` | `string = 'team_org_members'` | MongoDB 组织成员集合名 |
| `packages/global/support/user/team/org/constant.ts` | `SyncOrgSourceEnum` | `enum { wecom }` | 外部同步来源枚举（如企业微信） |

## 常量

| 文件 | 导出项 | 类型 | 说明 |
|------|--------|------|------|
| `packages/global/common/system/constants.ts` | `DEFAULT_ORG_AVATAR` | `string = '/imgs/avatar/defaultOrgAvatar.svg'` | 组织默认头像路径 |

## 函数依赖关系

- `useOrg` 依赖 `getOrgChildrenPath`（path 计算用）
- `OrgTree` 的 `OrgTreeNode` 通过 `useRequest` 调用 `getOrgList` 实现子树懒加载
