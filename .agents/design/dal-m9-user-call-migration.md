# M9：迁移 support/user 剩余调用到 UserRepository

关联任务：Kaneo M#9「迁移 support/user 剩余调用到 UserRepository」。
前置设计：[dal-basic-architecture.md](./dal-basic-architecture.md)。

## 目标

把 `packages/service/support/user` 及周边对 `MongoUser` 的剩余直接调用迁移到 `@fastgpt/service/common/dal` 的 `userRepository`，并清理 `getUserDetail` 的旧 `ClientSession` 兼容分支。迁移必须遵守「不能混用两种事务上下文」的约束。

## 现状盘点（直接依赖 MongoUser 的剩余调用）

| 调用点 | 用途 | 是否可直接迁移 |
| --- | --- | --- |
| `support/marketing/interface/crm.ts` | 按 ownerId 投影读取 `fastgpt_sem` | ✅ 纯 User 读取，无事务 |
| `support/user/account/verification/password/service.ts` | `findUserByCredentials`（登录事务内） | ⛔ 绑定旧 `consumeInTransaction`（ClientSession）+ 修改 Document 后 `save` |
| `support/user/controller.ts` `getUserDetail` | 登录事务内的用户读取（兼容分支） | ⛔ 依赖登录事务的旧 session |
| `pages/api/support/user/account/update.ts` | 资料更新（user + teamMember + 头像） | ⛔ 同一旧事务内改 TeamMember/头像资源 |
| `service/mongo.ts` `initRootUser` | root 初始化（user + 默认团队） | ⛔ 同一旧事务内 `createDefaultTeam`（Team/TeamMember/MemberGroup） |
| `pages/api/core/app/logs/exportLogs.ts` | 成员导出 `users` `$lookup` | ➖ 设计上明确暂不沉底的跨集合读模型 |

## 阻塞点

前三个 ⛔ 边界都在同一个旧 `ClientSession` 事务里同时操作 `users` 与 `teams/teamMembers/memberGroups`。
DAL 事务上下文是内部 symbol，旧 Model 无法参与 DAL 事务；Team/TeamMember 尚未有 DAL Repository。
因此按设计约束，必须先补齐 Team/TeamMember 垂直切片，才能迁移这三个流程并删除 `getUserDetail` 兼容分支。

## 候选方案

### 方案 A：完整做 M9（推荐）
1. 新增 Team / TeamMember（含 MemberGroup 最小能力）DAL：`domain`、`ports`、`mongodb`（models/mappers/repositories）+ 局部测试。
2. `verification` 提供基于 `transactionRunner` 的消费入口（DAL 事务变体），`consumeInTransaction` 内部使用 DAL 事务。
3. 迁移 `loginByPassword`（凭据校验 → `findByCredentials`，`lastLoginTmbId/language/fastgpt_sem` → `updateById`）。
4. 迁移 `update.ts`（user 字段走 `userRepository.updateById`，TeamMember 头像走新 TeamMember DAL，头像刷新保留）。
5. 迁移 `initRootUser`（root 用户走 `userRepository`，默认团队走 Team DAL）。
6. 删除 `getUserDetail` 兼容分支；`crm.ts` 投影读取迁移到 `userRepository`（新增投影方法）。
7. `exportLogs.ts` `$lookup` 维持现状（设计决策）。

### 方案 B：只做纯 User 部分
仅迁移 `crm.ts` 投影读取 + 新增对应 Repository 方法；三个事务边界与 `getUserDetail` 兼容分支保持现状，Team/TeamMember 切片另开任务。

## 待确认

- 选 A（完整迁移，改动较大，需新增 Team/TeamMember DAL 切片）还是 B（先只迁移纯 User 调用）？
- 若选 A：Team/TeamMember DAL 是否只覆盖当前三个流程所需的最小能力（findByIds/按 userId 查默认 tmb/创建默认团队/更新头像），不做完整 CRUD？

## 决策记录（2026-08-11，用户确认做 M9+M10）

选 **方案 A**，按最小能力落地：

### Team/TeamMember DAL 切片（最小能力）

- 新增 `TeamRepository` port，只覆盖三个流程所需能力：
  - `findMemberById(id, ctx?)`：按 tmbId 读 `{ userId, avatar }`（update.ts 用）。
  - `updateMemberAvatar(id, avatar, ctx?)`：更新 tmb 头像（update.ts 用）。
  - `createDefaultTeam({ userId, teamName?, avatar?, ctx })`：在 DAL 事务内创建默认
    团队（teams + team_members + team_member_groups + team_orgs 四条写入），返回新 tmb；
    已存在默认 tmb 时返回 `null`（沿用旧语义：已存在则跳过）。
- 新增 `TmpDataRepository`（最小能力）：`findActiveMaterial` / `deleteActiveMaterial`，
  供 verification 在 DAL 事务内读取和消费验证码材料。
- 权限合成（`getTmbPermission`，涉及 resource_permissions/memberGroups/orgs 读取）
  **留在 service 层、事务外**：登录/资料更新流程对 tmb/team/权限只读，读一致性由流程
  语义保证（tmb/team 在登录期间不变），不把 resource_permissions 切片拖进本次范围。
- `getUserDetail` 的 tmb/team 读取继续走旧 `getTmbInfoByTmbId` / `getUserDefaultTeam`
  （**不再传 session**），只把 `MongoUser` 读取换成 `userRepository.findById`，并删除
  旧 `ClientSession` 兼容分支。

### 事务边界（不能混用两种事务上下文）

- `loginByPassword`：验证码读取/消费 + 凭据校验 + `lastLoginTmbId/language/fastgpt_sem`
  更新全部在 **DAL 事务**内（`transactionRunner.withTransaction`）；tmb/team/权限读取在
  事务外（纯读，无 session）。
- `update.ts`：user 字段走 `userRepository.updateById`、tmb 头像走
  `teamRepository.updateMemberAvatar`，都在 DAL 事务内；S3 头像刷新（含 MongoS3TTL
  清理）改为 **事务提交后**执行、best-effort（try/catch + 日志），避免把 s3_ttl 集合
  拖进 DAL 事务。
- `initRootUser`：root 用户（`findByUsername`/`create`/`updateById`）与默认团队
  （`teamRepository.createDefaultTeam`）在同一个 DAL 事务内。

### 密码处理

- DAL User Model 的 `password` 已有 `set: hashStr`；迁移后统一传**明文**，由 DAL 负责
  哈希（与 `updatePasswordByOld` 既有用法一致），不再像旧 initRootUser 那样手工预哈希。

### 其他

- `crm.ts`：`MongoUser.findById(ownerId, 'fastgpt_sem')` 迁移为 `userRepository` 新增
  投影方法 `findSemById(id)`。
- `exportLogs.ts` 的 `users $lookup`：维持现状（跨集合读模型，设计上不沉底），只在本
  文档登记决策。
