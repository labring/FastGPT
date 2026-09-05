# 新建团队默认基础权限技术设计

## 1. 目标

新增环境变量：

```env
DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED=true
```

开启后，系统创建团队时为默认全员组授予以下权限：

- 创建应用；
- 创建 Skill；
- 创建知识库。

该能力作用于所有新建团队。环境变量默认值为 `false`，未配置时保持现有行为。

## 2. 总体方案

团队存在两条创建链路，因此主仓库和 Pro 都需要接入：

| 场景 | 创建入口 | 仓库 |
| --- | --- | --- |
| 应用初始化 `root` 团队 | `createDefaultTeam()` | FastGPT |
| 注册、手动创建等普通团队 | `createTeam()` | fastgpt-pro |

公共逻辑放在 FastGPT 主仓库的 `packages/service` 中：

1. 在 `serviceEnv` 定义环境变量；
2. 提供 `createTeamDefaultGroup()`，创建默认全员组并按配置初始化权限；
3. `createDefaultTeam()` 和 Pro `createTeam()` 统一调用该函数。

## 3. 权限设计

默认全员组名称为 `DEFAULT_GROUP`。鉴权时，系统会自动将该组加入团队成员的群组列表，因此只需为默认组创建一条团队资源权限记录，不需要逐个成员授权。

权限使用现有角色常量按位组合：

```ts
const defaultBasicRole =
  TeamAppCreateRoleVal |
  TeamSkillCreateRoleVal |
  TeamDatasetCreateRoleVal;
```

创建的权限记录如下：

```ts
{
  teamId,
  resourceType: PerResourceTypeEnum.team,
  groupId: defaultGroup._id,
  permission: defaultBasicRole
}
```

该组合不包含团队管理和 API Key 创建权限。实现中应使用角色常量，不直接写权限数值。

## 4. 实现设计

### 4.1 环境变量

在主仓库 `packages/service/env.ts` 中增加：

```ts
DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED: BoolSchema.default(false).meta({
  description: '新建团队时是否为默认全员组授予应用、Skill 和知识库创建权限'
})
```

FastGPT App 和 Pro 均使用 `packages/service`，因此共享同一份环境变量定义。部署时两个服务必须配置相同值。

### 4.2 默认全员组初始化

在主仓库新增独立模块：

```text
packages/service/support/permission/memberGroup/teamDefaultGroup.ts
```

该模块只依赖环境变量、权限常量、默认组 Model 和权限 service，不依赖团队 controller，避免与团队创建逻辑形成循环依赖。

新增函数：

```ts
export async function createTeamDefaultGroup({
  teamId,
  avatar,
  session
}: {
  teamId: string;
  avatar?: string;
  session?: ClientSession;
})
```

函数负责：

1. 创建团队默认全员组；
2. 环境变量开启时，创建默认组的团队资源权限；
3. 返回创建的默认组；
4. 调用方传入 session 时，默认组和权限写入复用该 session；未传入时由函数开启事务。

核心逻辑：

```ts
const [group] = await MongoMemberGroupModel.create(
  [
    {
      teamId,
      name: DefaultGroupName,
      avatar
    }
  ],
  { session, ordered: true }
);

if (serviceEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED) {
  await updateTeamCollaborator({
    teamId,
    collaborator: { groupId: String(group._id) },
    permission:
      TeamAppCreateRoleVal |
      TeamSkillCreateRoleVal |
      TeamDatasetCreateRoleVal,
    session
  });
}

return group;
```

权限记录通过现有 `updateTeamCollaborator()` 和 permission repository 写入，不直接操作 `MongoResourcePermission`。

现有 `getTeamDefaultGroup()` 继续只负责读取时补建缺失的默认组，不自动授予基础权限，避免环境变量开启后改变存量团队权限。

### 4.3 接入团队创建链路

主仓库修改 `packages/service/support/user/team/controller.ts`：

```text
createDefaultTeam()
  -> 创建 Team
  -> 创建 Owner TeamMember
  -> createTeamDefaultGroup()
  -> 创建根组织
```

Pro 修改 `admin/src/service/support/user/team/controller.ts`：

```text
createTeam()
  -> 创建 Team
  -> 创建 Owner TeamMember
  -> createTeamDefaultGroup()
  -> 执行原有后续初始化
```

两个入口都用 `createTeamDefaultGroup()` 替换原来直接创建 `MongoMemberGroupModel` 的代码。

### 4.4 事务

主仓库 `createDefaultTeam()`、手动创建团队和注册流程原本已使用事务，本次新增的默认权限写入继续复用同一个 session。

Pro `createTeam()` 的 session 调整为必传，并为企业微信授权创建团队增加 `mongoSessionRun()`。团队、Owner、默认组和默认权限任一步写入失败时整体回滚。公共 `createTeamDefaultGroup()` 按代码规范保留可选 session，但两个团队创建入口必须传入已有 session。

## 5. 修改文件

FastGPT 主仓库：

```text
packages/service/env.ts
packages/service/support/permission/memberGroup/teamDefaultGroup.ts
packages/service/support/user/team/controller.ts
projects/app/.env.template
```

fastgpt-pro：

```text
admin/src/service/support/user/team/controller.ts
admin/src/service/support/wecom/handler/auth.ts
admin/.env.template
```

## 6. 测试要点

1. 环境变量未配置或为 `false` 时，只创建默认组，不创建权限记录；
2. 环境变量为 `true` 时，默认组获得应用、Skill、知识库创建权限；
3. 默认权限不包含团队管理和 API Key 创建权限；
4. `root` 团队和 Pro 创建的普通团队行为一致；
5. 普通成员加入团队后可以创建应用、Skill 和知识库；
6. 权限写入失败时，团队创建事务能够回滚；
7. 企业微信授权创建团队时，所有初始化数据在同一事务中写入。

## 7. 验收标准

1. 默认关闭时，团队创建行为与当前版本一致；
2. 开启后，所有新建团队的全员组均获得三项基础权限；
3. 普通成员不能管理团队或创建 API Key；
4. 所有团队创建入口均在同一事务内完成团队和默认权限初始化。
