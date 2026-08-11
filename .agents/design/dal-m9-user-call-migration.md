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
