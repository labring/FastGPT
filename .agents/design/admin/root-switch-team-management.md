# Root 用户跨团队切换与全资源管理设计方案

> 状态：**已实现（Implemented）**
> 责任模块：`packages/service`、`projects/app`、`packages/global`、`pro/admin`
> 目标群体：系统超级管理员（`root` 用户）

---

## 1. 需求背景与最终设计决断

### 1.1 需求背景
在当前 FastGPT 体系中：
1. **超级管理员身份限制**：系统级超级管理员 `root`（`username === 'root'`）在首次登录或初始化时，仅归属于一个系统默认创建的主团队。
2. **团队切换限制**：现有团队切换逻辑要求当前用户必须已在目标团队的 `team_members` 中处于有效活跃状态，无法直接进入未加入的租户团队。
3. **运维与客户支持痛点**：多租户场景下，当某个团队遇到复杂的应用编排 Bug、向量检索异常、敏感数据审计或权限配置死锁时，管理员无法直接进入该团队现场调试和配置。

### 1.2 核心决断（经过多轮确认）
1. **JIT 专属成员锚定（方案 A）**：root 首次切换到目标团队时，在底层原子为其 upsert 一条专属的 `MongoTeamMember` 记录（`name: 'root'`, `status: 'active'`；非 root 自有团队不持久化 `role: 'owner'` 以避免污染单 owner 查询与迁移约束，而在运行时动态授予 `TeamPermission({ isOwner: true })`），拥有真实 `ObjectId` 物理记录，零侵入兼容全站 `$lookup`、联表查询与鉴权函数，真实归属审计。
2. **成员生命周期持久保留**：root 离开团队时不删除该记录，且禁止通过成员退出接口（`member/leave`）移除，确保历史创建的资源和审计关联始终有效。
3. **租户视角隐私隔离（`fastgpt-pro` 原生执行）**：在普通租户成员拉取团队成员列表、成员计数、CSV 导出、聚合检索、协作者列表及全员组预览时，商业版服务在数据库查询层直接过滤隐藏外来 root 成员；开源侧 `/api/proApi/[...path]` 保持纯净流式透传。
4. **防篡改安全保护与超管所有权变更（`fastgpt-pro` 原生执行）**：
   - 商业版服务端严格禁止非 root 租户成员（包括租户原 Owner）删除、改名、恢复、修改协作者权限或向外来 root 成员强制转移所有权（返回 HTTP `403` `TeamErrEnum.unPermission`）。
   - `root` 本人作为系统最高超管，可在 `team/changeOwner` 中将任意团队的所有权从当前 `ownerId` 转让给同团队任意活跃成员（包括转让给 `root` 自身，并豁免 `MAX_TEAM_OWNER_COUNT` 上限）。
5. **轻量一键切换与全站审计**：点击直接切换并后台静默记录 `ADMIN_SWITCH_TEAM` 审计日志；管理员后台系统审计日志（`/proApi/admin/system/audit/list`）使用 `adminCert` 鉴权并取消 `teamId` 过滤，跨团队切换后仍可查看全站管理操作日志。
6. **不使用顶部横幅**：界面保持纯净简洁，不增加常驻横幅。
7. **切换后直达 `/dashboard`**：重置聊天缓存后直接重定向至工作台应用列表。
8. **`TeamSelector` 交互升级**：
   - **全局移除「管理团队」** 选项；
   - **增加团队名搜索功能**（支持输入关键词即时过滤团队）；
   - **保持纯团队名展示**，不增加复杂后缀。

---

## 2. 详细技术方案设计

### 2.1 数据层与 JIT 锚定服务

#### 2.1.1 Root 成员记录规范
当 root 切换至 `targetTeamId` 时，由服务层原子执行以下逻辑：
```ts
export const ensureRootTeamMember = async ({
  targetTeamId,
  rootUserId,
  session
}: {
  targetTeamId: string;
  rootUserId: string;
  session?: ClientSession;
}) => {
  const isOwnTeam = String(targetTeam.ownerId) === String(rootUserId);
  const tmb = await MongoTeamMember.findOneAndUpdate(
    { teamId: targetTeam._id, userId: rootUserId },
    {
      $set: {
        status: TeamMemberStatusEnum.active,
        ...(isOwnTeam ? { role: TeamMemberRoleEnum.owner } : {})
      },
      $setOnInsert: {
        name: 'root',
        avatar: LOGO_ICON,
        isSetMemberName: true,
        createTime: new Date()
      }
    },
    { upsert: true, new: true, ...(session ? { session } : {}) }
  ).lean();

  return { team: targetTeam, tmb };
};
```

#### 2.1.2 成员配额穿透（Quota Bypass）与长期保留
- 该创建逻辑在 `switchTeamAsRoot` 内直接执行，绕过团队 `maxTeamMember` 席位检查。
- root 成员记录长期落库持久保留，切换离开时不删除，保证其名下创建的资源外键关联完好。

#### 2.1.3 租户视角隐藏与防操作防护（`fastgpt-pro` 原生实现）
- **成员只读接口原生过滤**：在商业版 `member/list`、`member/count`、`member/export`、`searchMembersOrgsGroups`、`collaborator/list`、`group/list`、`org/list` 中，当请求者非 `root` 且团队并非 `root` 自有团队时，通过 `getForeignRootMemberInfo(teamId)` 在查询与聚合阶段排除外来 `root` 成员，确保分页总数、导出 CSV 和全员组计数一致准确。
- **服务端防修改拦截**：在商业版 `member/delete`、`member/updateNameByManager`、`member/restore`、`collaborator/{update,updateOne,delete}`、`team/changeOwner` 及部门/成员组/资源变更接口中，通过 `assertTargetMemberNotRoot` / `getForeignRootMemberInfo` 原生拦截非 `root` 对外来 `root` 成员的变更（HTTP `403` `unPermission`）。

---

### 2.2 凭据与会话机制（Session Lifecycle）

1. **接口**：`PUT /api/admin/team/switch`
   - 入参：`{ teamId: string }`
   - 鉴权：严格校验 `authSystemAdmin`（必须是 root 超级管理员）
   - 流程：
     1. 验证目标团队存在且未删除；
     2. 调用 `ensureRootTeamMember` 确保 root 在该团队存在活跃成员记录；
     3. 创建目标团队新 Session（`teamId: targetTeamId`, `tmbId: rootTmb._id`, `isRoot: true`）；
     4. 写入 Cookie `fastgpt_token`；
     5. 记录 `ADMIN_SWITCH_TEAM` 审计日志；
     6. 返回新 Token 与团队详情。
2. **客户端流转**：
   - 客户端调用 `resetChatCache()` 清除本地聊天缓存；
   - 路由跳转至 `/dashboard` 进入目标团队工作台。

---

### 2.3 权限矩阵与全资源穿透机制

- **应用 (App/Workflow/Tool)**：`teamPer.isOwner` 短路，穿透所有 ACL，展示团队所有应用；`authApp` 对 root 均返回 `isOwner = true`。
- **知识库 (Dataset/Collection/Data)**：返回团队所有知识库，拥有无限制的创建、编辑、训练与检索测试权限。
- **协作者与权限配置 (Collaborators ACL)**：root 拥有团队级最高所有权，可随意为其他成员、分组、组织配置读写管权限位，或执行资源所有权转移（`changeOwner`）。

---

### 2.4 前端交互规范

1. **`/admin/teams` 团队管理表格**：
   - 每行操作列增加「进入团队」按钮；
   - 点击直接触发切换、更新凭据并跳转 `/dashboard`。
2. **`TeamSelector` 下拉组件改造**：
   - **全局移除「管理团队」** 项（所有用户均不再显示该项）；
   - **开启团队名搜索**（`isSearch={true}`，支持即时过滤搜索团队名）；
   - **仅展示纯团队名**，不添加多余的用户名前缀或后缀；
   - root 用户在下拉中可自由切换回初始团队或已进入过的团队。

---

## 3. 任务拆分与实施计划（Todo List）

### Phase 1: 核心服务与切换接口 (Backend Foundation)
- [x] **Task 1: 实现 Root 专属成员 JIT 锚定服务** (`packages/service`)
  - 实现 `ensureRootTeamMember`，支持原子 upsert、状态激活与配额穿透。
- [x] **Task 2: 实现管理员切换团队 API 与安全防护** (`projects/app`)
  - 实现 `PUT /api/admin/team/switch` 与 `GET /api/admin/team/list`，接入 `authSystemAdmin`。
  - 在成员修改/删除接口增加针对 root 记录的防篡改保护。
  - 在成员列表接口中增加非 root 请求者的 root 过滤。
- [x] **Task 3: 团队切换审计日志打点 (`ADMIN_SWITCH_TEAM`)**
  - 在审计事件中定义并记录源团队、目标团队、时间与 IP。

### Checkpoint 1: 接口功能与权限穿透验收
- [x] 针对 `ensureRootTeamMember` 和 `switch.ts` 编写单元测试通过。
- [x] 验证切换后 session 保持 `isRoot: true`，且非 root 成员列表中不出现 root。

---

### Phase 2: 资源管理闭环验证 (Resource Management)
- [x] **Task 4: 验证应用/工作流全量 CRUD 与版本发布**
- [x] **Task 5: 验证知识库全量 CRUD 与检索测试**
- [x] **Task 6: 验证协作者 ACL 配置与所有权转移**

### Checkpoint 2: 资源与权限闭环验收
- [x] 确认资源落库的 `tmbId` 均为 root 专属成员 ID，无关联断裂。

---

### Phase 3: 前端交互改造 (Frontend UX)
- [x] **Task 7: `/admin/teams` 表格增加「进入团队」按钮**
  - 在团队管理列表中增加切换操作，点击直接切团队并跳至 `/dashboard/agent`。
- [x] **Task 8: 改造 `TeamSelector` 下拉组件**
  - 全局移除「管理团队」菜单项；
  - 开启团队名搜索过滤（root 支持全站团队名称检索）；
  - 保持纯团队名展示。

### Checkpoint 3 (Complete): 端到端闭环验收
- [x] 完整动线：后台「进入团队」 -> 跳至 `/dashboard/agent` -> 管理全量资源 -> 通过 `TeamSelector` 搜索切回默认团队。
- [x] TypeScript 编译 0 报错。
