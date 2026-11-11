---
case_version: 1
id: "FG-PERMISSION-TEAM-002"
title: "root 用户切换任意团队并穿透管理全量资源与权限"
business: "permission/team"
types: [api, ui, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
tags:
  - root
  - 团队切换
  - JIT成员锚定
  - 权限穿透
  - 隐私隔离
  - 平台管理
  - Pro
  - 覆盖基础场景
  - 覆盖异常场景
  - 覆盖边界场景
evidence: [response, ui, database, cache]
sources:
  - .agents/design/admin/root-switch-team-management.md
  - packages/global/openapi/admin/team/api.ts
  - packages/global/openapi/admin/team/index.ts
  - packages/global/support/user/audit/constants.ts
  - packages/web/support/user/audit/constants.ts
  - packages/web/components/common/MySelect/index.tsx
  - packages/service/support/user/session.ts
  - packages/service/support/user/team/controller.ts
  - packages/service/support/user/team/teamMemberSchema.ts
  - packages/service/support/permission/auth/common.ts
  - packages/service/support/permission/teamLimit.ts
  - packages/service/support/permission/app/auth.ts
  - packages/service/support/permission/dataset/auth.ts
  - packages/service/support/permission/mcp/auth.ts
  - packages/service/support/permission/publish/authLink.ts
  - projects/app/src/pages/api/admin/team/switch.ts
  - projects/app/src/pages/api/admin/team/list.ts
  - projects/app/src/pages/api/proApi/[...path].ts
  - projects/app/src/pages/api/support/user/team/plan/getTeamPlanStatus.ts
  - projects/app/src/pages/api/support/mcp/list.ts
  - projects/app/src/pageComponents/admin/teams/index.tsx
  - projects/app/src/pageComponents/account/TeamSelector.tsx
  - projects/app/src/pageComponents/account/team/context.tsx
  - projects/app/src/components/Layout/index.tsx
  - projects/app/src/pages/account/info/index.tsx
  - projects/app/src/pages/account/team/index.tsx
  - projects/app/src/pages/account/thirdParty/index.tsx
routes:
  - PUT /api/admin/team/switch
  - GET /api/admin/team/list
  - GET /api/support/user/account/tokenLogin
  - GET /api/support/user/team/plan/getTeamPlanStatus
  - PUT /api/support/user/team/update
  - POST /api/core/app/list
  - POST /api/core/app/create
  - POST /api/core/dataset/list
  - POST /api/core/dataset/create
  - GET /api/support/mcp/list
  - PUT /api/support/mcp/update
  - POST /api/support/outLink/update
  - POST /api/proApi/support/user/team/member/list
  - GET /api/proApi/support/user/team/member/count
  - GET /api/proApi/support/user/team/searchMembersOrgsGroups
  - GET /api/proApi/support/user/team/collaborator/list
  - DELETE /api/proApi/support/user/team/member/delete
  - PUT /api/proApi/support/user/team/member/updateNameByManager
  - POST /api/proApi/support/user/team/member/restore
  - POST /api/proApi/support/user/team/collaborator/update
  - PUT /api/proApi/support/user/team/collaborator/updateOne
  - DELETE /api/proApi/support/user/team/collaborator/delete
  - PUT /api/proApi/support/user/team/changeOwner
  - POST /api/proApi/core/app/collaborator/update
  - POST /api/proApi/core/app/changeOwner
  - POST /api/proApi/core/dataset/collaborator/update
related:
  - FG-PERMISSION-TEAM-001
  - FG-ADMIN-AUDIT-001
automation: []
baseline: "1dedf6dcf75fbd23b86e11d19983a088c80e45d4"
---

# root 用户切换任意团队并穿透管理全量资源与权限

## 用例简介

系统超级管理员 `root` 无需事先受邀即可从平台管理团队列表或全局团队切换器进入任意租户团队，全权管理团队内的私有应用、知识库、分享外链、MCP 服务及成员与资源协作者权限。切换在底层按需创建持久保留的 `root` 专属成员锚点并保持 `isRoot` 会话与真实操作归属，同时对租户普通成员隐藏 `root` 记录、不占用套餐成员席位，并硬拦截租户侧对 `root` 成员的任何修改或移除。

## 前置准备

- 环境与版本：本地 dev 主应用（`BASE_URL`）及已配置的 MongoDB（主库 + 日志库）、Redis 与 Pro 服务（`FastGPTProUrl`）；记录实际运行进程的源码基线与提交，登录凭证通过环境变量（如 `FASTGPT_ROOT_PASSWORD`）注入，不硬编码真实密码。本用例暂未绑定自动化脚本（`automation: []`），由 AI 结合真实 HTTP、无头浏览器与只读库/缓存查询执行；`/api/proApi/*` 路由保持纯净流式转发，隐私隐藏、防篡改 403 拦截及团队所有权变更均由商业版 Pro 服务原生执行（若当前环境未启动 Pro 服务，对应 `/api/proApi/*` 项按商业版服务依赖边界登记）。
- 身份与权限：准备系统 `root` 账号（记录其初始主团队 `T_root` 及默认成员 `rootOwnTmbId`），以及本轮新建的独立租户团队 `T` 的真实所有者 `O`（`role: "owner"`）和普通成员 `M`（无管理权限）。另准备无 `root` 访问历史的租户团队 `T2`（名称含正则特殊字符 `RUN_<id> [Prod] Team`）、已软删除团队 `T_deleted`（`deleteTime` 非空）及处于注销冷静期的独立测试团队 `T_cancel`。
- 测试数据（公共基线 `D0`）：
  - 将 `T` 的套餐成员上限配置为 `maxTeamMember = 2`（由 `O` 与 `M` 恰好占满 2 席）。
  - 在 `T` 内由 `O` 创建仅本人可见的私有工作流应用 `W`、私有知识库 `D`、关联 `W` 的分享外链 `L`；由 `M` 创建个人所属的 MCP 发布项 `K`。以上资源均不向其他成员授予额外 ACL。
  - 保存操作前快照：`teams.findOne({_id: T})` 的 `ownerId`、`team_members.find({teamId: T})` 列表、日志库 `operationLogs` 当前最大 `_id` 及 `root` 登录后的初始 `sessionId`（Cookie `fastgpt_token` 值）。
- 复位约定：`C1 → C2 → C3` 为连续流转链路，依次验证切入 `T`、穿透管理资源与权限、切换离开后持久保留及租户视角隔离；`C4` 承接 `T` 已存在 `rootTmbId` 的状态并以 `O`/`M` 独立会话执行拒绝验证；`C5` 使用独立的 `T_cancel` 与全新团队 `T_race` 夹具，互不污染。
- 验证能力：浏览器可见交互与网络面板、HTTP 状态码与业务 JSON（`code`/`statusText`/`data`）、MongoDB 主库（`users`、`teams`、`team_members`、`apps`、`datasets`、`outlinks`、`mcp_keys`、`resource_permissions`）、MongoDB 日志库（`operationLogs`）只读查询，以及 Redis `HGETALL session:<sessionId>` 只读查询。
- 关联标识：所有新建团队、用户、应用、知识库名称均携带唯一 `RUN_ID`，并将生成的 `teamId`、`userId`、`tmbId`、`appId`、`datasetId`、`outLinkId`、`mcpId` 登记到本轮清理清单 `manifest`。
- 清理方式：测试结束后先将 `root` 切回初始主团队 `T_root`（恢复 `users.lastLoginTmbId = rootOwnTmbId`），再严格按 `manifest` 白名单清理本轮新建的应用、知识库、外链、MCP Key、权限记录、测试团队、测试账号及对应 `operationLogs` 测试行，严禁触碰 `T_root` 或共享开发库无关数据，最后只读核验 `manifest` 资源归零。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；公共基线 D0，`root` 位于初始主团队 `T_root` | `root` 浏览器访问 `/admin/teams`，定位满员租户团队 `T` 行并点击「进入团队」按钮；观察页面跳转、顶部布局、新旧 Cookie / Redis 会话、数据库成员锚点、套餐席位计数及审计日志。 |
| C2 | 基础场景；承接 C1，`root` 已处于团队 `T` 会话 | 在 `T` 工作台与账号页依次列出并编辑私有应用 `W`、私有知识库 `D`、外链 `L`、成员 `M` 的 MCP 服务 `K` 及团队信息；由 `root` 新建应用 `W_root` 与知识库 `D_root`；通过权限弹窗为 `M` 授予 `W`/`D` 协作者管理权限、更新团队协作者权限，并将 `W_root` 所有权转移给 `M`。 |
| C3 | 边界场景；承接 C2，含 `root` 与租户 `O`/`M` 独立会话对照 | 分别以 `root` 和 `O` 打开 `/account/info` 与 `/account/team` 的 `TeamSelector` 下拉，检查菜单项并在搜索框输入 `[Prod]` 与 `T_deleted` 名称片段；`root` 选中从未进入过的 `T2` 完成切换后再切回 `T_root`。随后以 `O` 会话查询 `T` 的成员列表、成员计数、聚合搜索与团队协作者列表，并在将 `M` 暂时移出后尝试新增 1 名真实成员（验证后恢复 `M`）。 |
| C4 | 异常场景；承接 `T` 已含 `rootTmbId` 状态，切换 `O`/`M`/匿名会话 | `O`、`M` 与未登录客户端分别请求 `PUT /api/admin/team/switch` 和 `GET /api/admin/team/list`；`root` 分别用 `POST` 方法、不存在的 `ObjectId` 及软删除团队 `T_deleted` 请求切换接口。随后以租户 Owner `O` 会话携带 `rootTmbId`/`rootUserId` 依次请求删除成员、管理员改名、恢复成员、覆盖/单项更新/删除团队协作者权限及转让团队所有权接口。 |
| C5 | 边界场景；独立注销冷静期团队 `T_cancel` 与全新团队 `T_race` | 普通成员登录态访问 `T_cancel` 页面与接口作为对照；`root` 调用切换进入 `T_cancel` 后访问工作台页面及 `tokenLogin`/`app/list`/`dataset/list`。另由 `root` 对从未访问过的 `T_race` 同时并发发起 5 个 `PUT /api/admin/team/switch` 请求。 |

## 预期结果

公共断言：每次合法切换返回 HTTP `200` 且业务 `code === 200`，响应 `Set-Cookie` 写入 `HttpOnly` 的 `fastgpt_token`；`teams` 集合中各租户团队的 `ownerId` 始终保持原租户 Owner 不变，任何跨租户代管均不得在 `team_members` 中新增第二个 `role: "owner"` 文档。只读核查统一按 `manifest` 中的 `teamId` 与 `rootUserId` 限定：

```js
// 主库：核查目标团队 owner 与 root 成员锚点
db.teams.findOne({ _id: ObjectId("<T>") }, { name: 1, ownerId: 1, deleteTime: 1 });
db.team_members.find(
  { teamId: ObjectId("<T>") },
  { userId: 1, name: 1, role: 1, status: 1, isSetMemberName: 1 }
);

// 日志库：核查跨团队切换审计记录（1 秒轮询，最长等待 15 秒）
logDb.operationLogs.find({
  teamId: ObjectId("<T>"),
  event: "ADMIN_SWITCH_TEAM"
});
```

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI + HTTP + Redis + MongoDB | 点击「进入团队」后自动跳转至 `/dashboard/agent`，页面顶部无额外代管横幅；`GET /api/support/user/account/tokenLogin` 返回 `team.teamId === T`、`team.tmbId === rootTmbId` 且 `team.permission.isOwner === true`。Redis 中 `HGETALL session:<newToken>` 含 `userId=<rootUserId>`、`teamId=<T>`、`tmbId=<rootTmbId>`、`isRoot="1"`，旧 `session:<oldSessionId>` 已不存在。`team_members` 在 `T` 下恰好新增 1 条 `{ userId: rootUserId, name: "root", status: "active", isSetMemberName: true }` 且 `role` 字段未定义，`O` 的 `role: "owner"` 唯一保持；`users.lastLoginTmbId` 更新为 `rootTmbId`。虽团队已达 `maxTeamMember = 2`，切换不被阻断，且 `GET /api/support/user/team/plan/getTeamPlanStatus` 返回 `usedMember === 2`。日志库 `operationLogs` 在 15 秒内新增 1 条 `event: "ADMIN_SWITCH_TEAM"`，`metadata` 匹配 `{ name: "root", sourceTeamId: "<T_root>", targetTeamId: "<T>", targetTeamName: "<T.name>" }`。 | 跳转前后 URL 与页面可见元素截图、`switch` 与 `tokenLogin` 脱敏响应、Redis 新旧 key 查询结果、`team_members`/`users`/`operationLogs` 快照。 |
| C2 | UI + HTTP + MongoDB | `POST /api/core/app/list` 与 `POST /api/core/dataset/list` 完整返回私有资源 `W`、`D` 且各项 `permission.isOwner === true`；`GET /api/support/mcp/list` 包含 `M` 创建的 `K`，`root` 调用 `PUT /api/support/mcp/update` 与 `POST /api/support/outLink/update` 均返回业务 `200`。新建的 `W_root`、`D_root` 在 `apps`/`datasets` 中 `teamId === ObjectId(T)` 且 `tmbId === ObjectId(rootTmbId)`（不伪造为 `O` 的 `tmbId`）。`/account/team` 标题旁可见编辑图标且 `PUT /api/support/user/team/update` 成功更新团队名称；`/account/thirdParty` 按 Owner 权限展示配置入口。Pro 可用时，`POST /api/proApi/core/app/collaborator/update`、`POST /api/proApi/core/dataset/collaborator/update`、团队协作者更新均成功写入 `resource_permissions`，`POST /api/proApi/core/app/changeOwner` 成功将 `W_root.tmbId` 更新为 `M` 的 `tmbId`。 | 各列表/编辑/授权接口响应、`apps`/`datasets`/`resource_permissions` 前后精确字段对比及页面可见控件截图。 |
| C3 | UI + HTTP + MongoDB | `root` 与 `O` 打开 `TeamSelector` 时，下拉列表中均不存在「管理团队」（`value: "manage"`）项，所有选项仅展示纯团队名称（无 Owner 或 ID 后缀），且顶部内嵌搜索框可正常输入。`root` 输入 `[Prod]` 时 `GET /api/admin/team/list?search=%5BProd%5D` 不抛正则异常并精确命中 `T2`，输入 `T_deleted` 不返回已软删除团队；选中 `T2` 后自动触发 `PUT /api/admin/team/switch` 并在 `T2` 生成活跃锚点。`root` 切回 `T_root` 后，`T` 的 `team_members` 中 `root` 记录仍保持 `status: "active"` 未被删除。切换为 `O` 会话观测 `T` 时：`member/list` 的 `list` 无 `rootUserId`/`rootTmbId` 且 `total === 2`，`member/count` 返回 `count === 2`，`searchMembersOrgsGroups` 的 `members` 与 `collaborator/list` 的 `clbs` 均不包含 `root`；席位校验仍以有效非 `root` 成员数 `2` 计算，不因 `root` 锚点误报 `teamOverSize`。 | `TeamSelector` 展开与搜索可见截图、`admin/team/list` 响应、离开后 `T` 的 `team_members` 快照、`O` 视角四个只读接口原始响应。 |
| C4 | HTTP + MongoDB | `O`、`M`、匿名请求 `/api/admin/team/switch` 与 `/api/admin/team/list` 均返回鉴权拒绝（`unAuthorization`），不产生任何 `team_members` 或 `ADMIN_SWITCH_TEAM` 写入；`root` 使用 `POST` 方法返回 `invalidParams`，传入不存在或已软删除团队返回 `invalidResource`。`O` 针对 `rootTmbId` / `rootUserId` 调用 `member/delete`、`member/updateNameByManager`、`member/restore`、`collaborator/update`、`collaborator/updateOne`、`collaborator/delete`、`team/changeOwner` 全部返回 HTTP `403` 且业务 `statusText === "unPermission"`；核查 `team_members` 中 `root` 记录的 `name === "root"`、`status === "active"` 及 `teams.ownerId` 与操作前快照完全一致。 | 各拒绝请求的 HTTP 状态码与响应体、操作前后 `team_members`/`teams`/`resource_permissions` 快照零差集。 |
| C5 | UI + HTTP + MongoDB | 普通成员访问 `T_cancel` 被注销门禁拦截（`accountCancellationPending` / 页面跳转 `/account/cancel`）；`root` 切换进入 `T_cancel` 后浏览器停留在业务页面不发生 `/account/cancel` 强制跳转，`tokenLogin`、`app/list`、`dataset/list` 均返回 `200`。对 `T_race` 并发发起的 5 次切换请求全部返回 `200` 且返回相同的 `tmbId`，`db.team_members.countDocuments({ teamId: ObjectId(T_race), userId: ObjectId(rootUserId) })` 精确等于 `1`。 | `T_cancel` 下普通成员与 `root` 的路由/响应对照、并发 5 次响应结果及 `T_race` 的 `team_members` 唯一记录查询。 |
