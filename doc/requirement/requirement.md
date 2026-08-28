# 文件级权限管理系统需求规格说明

### 统一权限语义（强制约束）

### 关键可见性与搜索规则（强制验收）
- **文件列表按权限过滤**：服务端在数据库查询/批量过滤阶段仅返回当前主体对 collection 解析为 read 及以上的文件；无权文件不得占用分页、总数、游标、排序、聚合或错误差异。
- **文件夹权限穿透平铺**：祖先文件夹不可见时，仅当用户对目标知识库具有 read 及以上权限，才可将该知识库脱离隐藏路径平铺展示并直接访问；仅拥有知识库内某个文件权限时，不展示该知识库，也不单独展示该文件。平铺结果不得暴露完整隐藏路径。
- **知识库权限门槛**：详情、列表、搜索、平铺和检索均先校验知识库 read；文件级 read 不能绕过知识库门槛。知识库无 read 时，知识库及其全部文件均隐藏。
- **当前路径限定搜索**：搜索请求必须携带规范化当前路径/父资源谓词，仅查询当前路径及允许展示的子树；禁止先做全局搜索再截断。非法或无权路径返回统一空/无权结果。
- 所有 dataset、dataset 文件夹、collection 文件夹和 collection 仅使用 `inheritPermission` 布尔字段，默认 `true`。`true` 沿父链解析权限；`false` 只使用资源自身显式配置和 owner 权限。
- 不存在额外的权限字段、枚举或隐式传播开关。需要独立权限时，服务端将目标资源及未配置的子资源纳入显式非继承控制子集并置为 `inheritPermission=false`；已有显式配置的子资源保持自身权限。
- 显式非继承控制子集必须在服务端计算、持久化并审计；父级后续变化不得放大该子集。
- 文件列表、文件夹穿透平铺、当前路径搜索及 RAG 检索均必须先执行资源路径/知识库门槛，再执行文件级 read 过滤；只拥有文件权限而没有知识库 read 时，不展示知识库及其文件。

> 生成时间: 2026-08-03
> 分析维度: 功能细化 | 预期效果 | 依赖关系
> 输入来源: `doc/requirement/fr-nfr-draft.md`（FR/NFR 草稿）、`doc/requirement/user-story.md`（US-1 ~ US-14）、wiki 页面 v11 记录

## 文档说明


---

## 1. 需求背景和目标

### 1.1 背景概述

FastGPT 当前权限体系以 **team 为资源绑定单位**，权限粒度仅到资源类型（dataset / app / evaluation / model 等），通过 `resource_permissions` 表管理。核心痛点是**权限粒度不足**：同一个知识库（dataset）下的不同文件（collection / 文档）无法区分「谁能看、谁能改、谁不能看」。

本需求为 collection（文件 / 文件夹）建立独立于 dataset 的权限配置能力，并围绕继承 / 独立状态、显式非继承子集控制、移动、恢复继承、冲突检测、所有权转移、存量升级等能力完善文件级权限管理。

**检索联动（US-11 / FR-11）**：知识库检索（KB 检索 / RAG 检索 / OpenAPI 检索）的召回结果**按文件级（collection 级）权限过滤**——用户仅能召回其解析后具有 read 及以上权限的 collection 内容，无 read 权限的 collection 内容不得出现在任何召回结果中（含 folder 递归展开或 dataset 级权限绕过）；在扩展资源管理与权限配置能力的同时，检索链路的权限判定下沉到文件级。

### 1.2 用户角色和场景

| 角色 | 核心场景 |
|------|---------|
| 团队拥有者（team owner） | 拥有团队内所有资源 owner 权限；可转移资源所有权；可执行存量权限一键升级 |
| 资源拥有者（resource owner） | 拥有某 dataset / collection 的所有权；可配置协作者、转移所有权 |
| 协作者（collaborator） | 通过 tmbId / groupId / orgId 被授予 read / write / manage；可按文件独立授权 |
| 团队普通成员 | 通过 team / org / group 层级继承权限；文件级权限可控制其可见性 |

### 1.3 核心痛点

- **痛点1**: 同一 dataset 下不同文件无法区分访问权限
  - 影响继承控制: 知识库管理员 / 团队所有成员
  - 严重程度: 高
- **痛点2**: 文件夹权限传播不可控，未显式配置的子资源可能意外继承权限
  - 影响继承控制: 知识库管理员
  - 严重程度: 中
- **痛点3**: move / 恢复继承等操作后权限残留、冲突、泄漏
  - 影响继承控制: 知识库管理员 / 系统运维
  - 严重程度: 高（数据正确性）
- **痛点4**: 存量数据在继承逻辑升级后语义不一致，需一键重算
  - 影响继承控制: 系统管理员
  - 严重程度: 中

### 1.4 用户旅程

1. 管理员在 dataset 下创建文件 collection → 默认继承父级权限（US-3）。
2. 管理员对单个文件配置协作者（read/write/manage）→ 同 dataset 不同文件解析出不同权限（US-1 / US-7）。
4. 管理员移动文件/文件夹 → 保持其本身的继承关系不变：原继承态继承新父级权限，原独立态保持独立配置（US-5）。
5. 管理员恢复误配置资源的继承（US-6）。
6. 管理员配置的子级权限与父级冲突 → 自动取消继承并保留独立配置（US-8）。
7. owner 将资源所有权转移给成员（US-9）。
8. 系统管理员在版本升级后一键重算存量权限（US-10）。
9. 使用者检索知识库 → 召回结果按文件级权限过滤，无 read 权限文件的内容不被召回（US-11）。

### 1.5 需求目标

- **目标1**: 实现 collection 级权限数据模型与解析 - 成功标准: 同一 dataset 下不同 collection 可解析出不同权限位（FR-1 验收）
- **目标2**: 通过 `inheritPermission` 与显式非继承子集实现权限传播控制 - 成功标准: 默认继承、非继承资源不受父级后续变更影响，已有独立配置保持不变
- **目标3**: 权限写操作无残留、无冲突、无泄漏 - 成功标准: move/恢复继承/changeOwner 后自动校验脚本残留数 = 0（NFR-3）
- **目标4**: 列表性能不退化 - 成功标准: 10,000 collection、P95 ≤ 800ms（NFR-1）
- **目标5**: 检索按文件级权限过滤 - 成功标准: 越权召回为 0、漏召回为 0、全路径一致（searchTest / 对话 / OpenAPI 无旁路）（NFR-8）；全继承态存量与既有 dataset 级行为等价（NFR-4）

---

## 2. 功能需求详细分析(后端)

> **本章节是核心**:每个功能都经过深度分析，描述清晰的功能价值和预期效果

> **🚨 重要约束**: 本章节只包含功能性需求（业务功能、接口、数据处理逻辑等），非功能性需求（性能、安全、可靠性等）在第5章"非功能需求详细说明"中描述

### 2.1 功能概览

| 功能编号 | 功能名称 | 类型 | 实现类型 | 所属业务仓库 | 相关现有接口 | 需要方案设计 | 需要方案选型 | 优先级 | 复杂度 | 依赖功能 |
|---------|---------|------|---------|------------|-------------|------------|------------|-------|-------|---------|
| F001 | collection 级权限数据模型与继承解析 | 增量功能 | 后台功能 | fastgpt-service | - | 是 | 否 | P0 | 中 | - |
| F002 | collection 协作者配置接口 | 全新功能 | 接口功能 | fastgpt-pro | - | 是 | 否 | P0 | 高 | F001 |
| F004 | 创建资源默认继承父级权限 | 增量功能 | 后台功能 | fastgpt-service | POST /api/core/dataset/collection/create | 是 | 否 | P0 | 中 | F001 |
| F006 | 移动（move）时的权限处理 | 增量功能 | 接口功能 | fastgpt-app | PUT /api/core/dataset/collection/update | 是 | 否 | P0 | 高 | F001 |
| F007 | 恢复继承 | 增量功能 | 接口功能 | fastgpt-app | POST /api/core/dataset/collection/resumeInheritPermission | 是 | 否 | P1 | 中 | F001 |
| F008 | 权限冲突检测与自动取消继承 | 增量功能 | 后台功能 | fastgpt-global | - | 是 | 否 | P0 | 高 | F001,F002 |
| F009 | 所有权转移 changeOwner | 增量功能 | 接口功能 | fastgpt-pro | POST /api/proApi/core/dataset/collection/changeOwner | 是 | 否 | P1 | 高 | F001 |
| F010 | 存量权限一键升级 | 全新功能 | 接口功能 | fastgpt-pro | - | 是 | 是 | P1 | 高 | F001-F009 |
| F011 | 统一权限校验逻辑 | 增量功能 | 后台功能 | fastgpt-service | - | 是 | 否 | P0 | 中 | F001 |
| F012 | collection 增删改查权限门槛 | 增量功能 | 接口功能 | fastgpt-app | PUT /api/core/dataset/collection/update | 是 | 否 | P0 | 中 | F001,F011 |
| F013 | 权限数据存储与同步一致性 | 增量功能 | 后台功能 | fastgpt-service | - | 是 | 否 | P0 | 高 | F001-F009 |
| F014 | 知识库检索（RAG 召回）按文件级权限过滤 | 增量功能 | 后台功能 | fastgpt-service | POST /api/core/dataset/searchTest | 是 | 否 | P0 | 高 | F001,F011 |
| F015 | 文件列表权限过滤 | 增量功能 | 接口功能 | fastgpt-app | GET /api/core/dataset/collection/list | 是 | 否 | P0 | 高 | F011,F012 |
| F016 | 隐藏路径穿透平铺展示 | 全新功能 | 接口功能 | fastgpt-app | GET /api/core/dataset/collection/list | 是 | 否 | P0 | 高 | F011,F012 |
| F017 | 知识库权限门槛 | 增量功能 | 后台功能 | fastgpt-service | - | 是 | 否 | P0 | 中 | F011 |
| F018 | 当前路径限定搜索 | 全新功能 | 接口功能 | fastgpt-service | GET /api/core/dataset/list、GET /api/core/dataset/collection/list | 是 | 否 | P0 | 高 | F011,F017 |

**说明**:
- **类型**: 标注是"增量功能"还是"全新功能"（基于内部分析得出）
- **实现类型**: 标注是"接口功能"、"后台功能"还是"全栈功能"（基于内部分析得出）
- **所属业务仓库**: 标注该功能所属的业务仓库/项目名称（fastgpt-service=packages/service、fastgpt-global=packages/global、fastgpt-app=projects/app、fastgpt-pro=pro）
- **相关现有接口**: 仅增量接口功能有值，格式为"{HTTP方法} {路径}"；全新功能或后台功能填"-"
- **F014 说明**: FR-11 为检索行为需求：在既有 dataset 级 read 入口鉴权之上，叠加 collection 级「可读 collection 批量解析」（F011）对召回候选做文件级过滤（searchTest / 对话 KB 召回 / OpenAPI 三入口复用同一过滤函数）；对外检索接口入参不变，实现类型归为后台（检索链路过滤逻辑）。

**编号映射表（F ↔ FR ↔ US ↔ NFR，S-7 统一口径）**：

| 规格功能 | 草稿 FR | 用户故事 | 规格功能 | 草稿 FR | 用户故事 |
|---------|--------|---------|---------|--------|---------|
| F001 | FR-1 | US-1/US-7 | F008 | FR-8 | US-8 |
| F002 | FR-2 | US-7 | F009 | FR-9 | US-9 |
| F004 | FR-4 | US-3 | F010 | FR-10 | US-10 |
| F006 | FR-6 | US-5 | F011 | FR-12 | - |
| F007 | FR-7 | US-6 | F012 | FR-13 | - |
| F014 | FR-11 | US-11 | F013 | FR-14 | - |
| F015 | FR-15 | - | F016 | FR-16 | - |
| F017 | FR-17 | - | F018 | FR-18 | - |

| 非功能 | 草稿 NFR | 规格章节 | 非功能 | 草稿 NFR | 规格章节 |
|--------|---------|---------|--------|---------|---------|
| 性能-列表过滤 | NFR-1 | §5.1 | 兼容性-存量迁移/检索 | NFR-4 | §3.1 存量兼容 + §5.3 升级重入 |
| 性能-递归/批量同步 | NFR-2 | §5.1 | 安全-鉴权/越权/审计 | NFR-5 | §5.2 |
| 正确性-无残留/冲突/泄漏 | NFR-3 | §5.3 | 可靠性-事务/幂等 | NFR-6 | §5.3 |
| 性能-检索热路径过滤 | NFR-7 | §5.1 | 正确性-检索过滤 | NFR-8 | §5.3 |

---

### 2.2 功能详细描述

> 通用约定（适用于所有功能）：
> - **错误响应统一格式**：`{ "code": 50xxxx, "statusText": "<错误枚举>", "message": "<i18n 文案>", "data": null }`，HTTP 状态默认 200（业务错误码），`CommonErrEnum.fileNotFound` 例外返回 HTTP 404。
> - **权限位**：read=`0b100`(4)、write=`0b010`(2)、manage=`0b001`(1)、owner=`~0>>>0`(4294967295)。角色值为累计位：write=`0b110`(6)（含 read）、manage=`0b111`(7)（含 write+read）。
> - **协作者标识**：`tmbId` / `groupId` / `orgId` 三选一且唯一（`CollaboratorIdType = RequireOnlyOne`）。
> - **权限校验顺序**（`getTmbPermission` 现有语义）：个人 tmbId 记录优先；若不存在，取 groupId 集合与 orgId 集合记录的 `sumPer`（按位 OR）最大值。

> **继承态数据不变量与解析语义（权威定义，全文档唯一口径，P-1 冻结）**：
> - **落库（写路径）**：继承态非 folder 资源 clbs 仅含自身 owner 记录（≤1 条）；继承态 folder 资源 clbs = 父级 clbs 的「owner→manage 映射副本」+ 自身 owner 记录（**父级 owner 在子资源上以 manage 呈现**）。同步原语 `createResourceDefaultCollaborators` / `syncCollaborators` / `resumeInheritPermission` 均将父级 owner 映射为 manage；`syncChildrenPermission` 不下发 owner 位。
> - **解析（运行时）**：`resolvePermission` 沿继承链递归父级有效权限时，父级 owner 位**封顶为 manage**（不透传 owner）；最终 = `sumPer(父级有效权限（owner→manage 封顶）, 自身 clbs 权限)`。`sumPer` 为按位 OR、幂等，与落库快照一致，无重复计数问题。
> - **安全推论**：父级 owner 经继承链在子资源上**至多获得 manage**，不能经继承获得子资源 owner 级操作权（如直接对子 collection 执行 changeOwner）；owner 级操作需该资源**自身** owner 记录，owner 记录仅由创建默认、changeOwner 产生（协作者接口不可授予 owner，见 S-3 决策）。

#### 2.2.1 接口功能

---

##### 功能F002: collection 协作者配置接口 (全新功能)

###### 功能描述

**功能类型**: 全新功能
**功能实现类型**: 接口功能
**业务目标**: 为单个文件（collection）直接配置协作者（read/write/manage），实现文件级单独授权（US-7）。
**技术目标**: 复用 dataset 版 `collaborator/update` 的语义与事务模式，支持 folder 全量下发、冲突自动取消继承（FR-8）、继承状态变更（FR-3）。

**参考功能**:
- 可参考功能: dataset 协作者配置 `pro/admin/src/pages/api/core/dataset/collaborator/update.ts:43-122`（`handler`）
- 参考价值: 全量 clbs 下发、`checkRoleUpdateConflict` 冲突判定、`updateResourceCollaborators` 事务落库、审计日志模式，均可对齐复用；仅鉴权目标从 dataset 换为 collection。

**新增接口规格**:
- **接口路径**: `POST /api/proApi/core/dataset/collection/collaborator/update`
- **鉴权**: 目标 collection `manage` 权限及以上（`ManagePermissionVal`）；root 可放行。

###### 输入定义

| 输入项 | 类型 | 来源 | 必填 | 约束条件 | 示例 |
|-------|------|------|------|---------|------|
| collectionId | String(ObjectId) | 请求参数 | 是 | 必须存在且属于请求 team；否则 `unExistCollection` / `unAuthDataset` | "660b3f..." |
| collaborators | Array | 请求参数 | 是 | 继承态资源必须非空（清空走 F007）；独立态资源允许空数组（清空非 owner clb，保持独立态，S-8）；仅继承状态变更请求可省略；每项 `tmbId`/`groupId`/`orgId` 三选一唯一；`permission` 必须为合法角色值之一 | [{tmbId:"u1",permission:6}] |
| collaborators[].permission | Number | 请求参数 | 是 | 枚举: 4(read) / 2(write) / 6(write角色) / 1(manage) / 7(manage角色)；**不含 owner(4294967295)**——owner 记录由资源 tmbId 派生，不可经协作者接口授予/移除，仅创建默认与 changeOwner 可变更（S-3 已冻结）；非法值报参数错误 | 6 |

**输入校验规则**:
1. `collectionId` 为空 → `CommonErrEnum.missingParams`。
2. `collaborators` 为空数组：继承态资源 → `CommonErrEnum.missingParams`（清空请走恢复继承 F007）；独立态资源 → 合法清空操作（清空全部非 owner clb，保持独立态，仅保留自身 owner 记录，S-8 已冻结）。
3. `collaborators` 项中 `tmbId`/`groupId`/`orgId` 多于一项或全缺 → `CommonErrEnum.invalidParams`。
4. `permission` 不在合法角色值集合（4/2/6/1/7，**不含 owner**）→ `CommonErrEnum.invalidParams`。

###### 输出定义

**成功响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

**失败响应**:

| 错误码 | 错误信息(statusText) | 触发条件 | 处理建议 |
|-------|---------|---------|---------|
| 507004 | missingParams | collectionId 缺失 / 继承态下 collaborators 为空数组 | 补齐参数后重试 |
| 501004 | unAuthDataset | 用户无 collection manage 及以上权限；或非 owner 提交含 manage 角色的配置 | 联系资源 owner / 需 owner 操作 |
| 501011 | canNotEditAdminPermission | 配置列表中包含操作者自身（tmbId 等于当前操作者） | 移除自身条目 |
| 501003 | unExistCollection | collectionId 不存在 | 确认 collectionId |

###### 正常路径

**前置条件**：
- 系统状态: 目标 collection 存在，资源归属正常（`collection.teamId == dataset.teamId`）。
- 用户状态: 已登录，持有 collection `manage` 及以上权限（或 root）。
- 数据状态: `resource_permissions` 表可写，collection 资源类型已启用（T-1 落地后）。

**触发条件**: 用户在前端为某 collection 保存协作者配置。

**步骤**:
2. 系统校验 `collectionId` 存在且团队归属一致。
3. 系统调用 `authDatasetCollection({ collectionId, per: ManagePermissionVal })` 鉴权（collection 维度，permission 解析走统一校验 F011）。
4. 系统校验入参（自身不可改、非 owner 不可含 manage 角色）。
5. 系统读取父级 clbs（`parentId`，根级文件取 `datasetId`）与自身旧 clbs。
6. 系统计算 `oldRealClbs`（继承态非 folder 时与父级 merge），计算 `changedClbs`。
7. 系统执行冲突判定（F008）：冲突且为继承态且有父级 → 置 `inheritPermission=false`；folder → 全量替换自身 clbs 并下发到继承态子 folder。
8. 系统在 mongo session（事务）内落库 `resource_permissions`。
9. 系统异步写审计日志（`AuditEventEnum.UPDATE_COLLECTION_COLLABORATOR` 扩展）。

**后置条件**：
- 系统状态: `resource_permissions` 中目标 collection 的 clbs 与提交一致（folder 下继承态子 folder 已同步）。
- 数据状态: 若发生冲突，collection 的 `inheritPermission` 已置为 `false`。
- 用户反馈: 返回成功；前端刷新协作者列表。

**成功标准**：
- [ ] `resource_permissions` 中目标 collection 新增/更新/删除的记录与提交全量列表一致。
- [ ] 继承态无冲突时 `inheritPermission` 保持 `true`，仅增量更新自身 clbs。
- [ ] folder 配置后其继承态子 folder clbs 与最新全量配置一致（仅 `inheritPermission=true` 子 folder 被下发，T-6 已冻结）。
- [ ] 反例：冲突取消继承后的**非继承**子 folder 不被后续父级配置覆盖，保持独立配置。

###### 异常路径

**EP-1（越权）**: 用户仅有 collection `read` 权限调用 → 返回 `unAuthDataset`，`resource_permissions` 无任何变更。
**EP-2（修改自身）**: 提交列表中 `tmbId` 等于操作者自身 → 返回 `canNotEditAdminPermission`，不做任何写入（防提权/锁死）。
**EP-3（非 owner 提升管理）**: 非 owner 用户提交含 `manage` 角色的配置 → 返回 `unAuthDataset`，不做任何写入。
**EP-4（入参非法）**: `collaborators` 为空或标识不唯一 → 返回 `missingParams` / `invalidParams`，不做任何写入。
**EP-5（事务失败）**: 落库中途 DB 异常 → mongo session 回滚，`resource_permissions` 与 `inheritPermission` 均保持操作前状态（无半写）。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 配置列表包含资源 owner 本人（tmbId = 资源 tmbId） | owner 记录不受配置影响（由 tmbId 派生，S-3），保持 owner；其余项按正常规则写入 |
| 配置列表为空（期望清空） | 继承态资源返回 `missingParams`（清空走恢复继承 F007）；独立态资源允许清空（清空非 owner clb，保持独立态，仅留自身 owner 记录，S-8） |
| 同协作者同时出现在 tmbId 与 groupId | 分别落库两条记录；校验时按 `sumPer` 取最高（tmbId 优先返回，不叠加） |
| permission 传 6 与传 2 | 均表示 write 语义；落库统一存 6（write 角色累计位），校验按位判断 |
| folder 子节点 1000+ 个 | 继承态子 folder 全量同步走 BFS + `bulkWrite`（NFR-2），不逐条 await |
| 目标为根级文件（parentId 为空） | 父级 clbs 取 `datasetId` 的 clbs；冲突判定按 dataset 为父 |
| 并发重复提交相同列表 | 全量下发天然幂等，第二次执行产生 0 变更 |

---


###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 全栈功能（字段扩展 + 接口入参 + 后台传播逻辑）

**【如果是增量功能】相关现有功能**:
- 现有接口: `PUT /api/core/dataset/update` - 代码位置: `projects/app/src/pages/api/core/dataset/update.ts:55-137`（dataset 更新，含 move）
- 现有数据模型: `datasets`（`MongoDataset`） - 代码位置: `packages/service/core/dataset/schema.ts:128-131`（已有 `inheritPermission`）

**输入定义（继承状态变更请求）**:

**输出定义（增量接口变更）**:
- 无其他输出变更。

###### 正常路径

**前置条件**：
- 系统状态: 目标资源为 dataset（任意类型）或 folder 类型 collection。
- 用户状态: 持有目标资源 `manage` 及以上权限。
- 数据状态: 资源存在。

**触发条件**: 管理员在配置权限时选择继承控制并保存。

**步骤**:
2. 系统鉴权 `manage` 及以上。
6. 系统在 mongo session 内原子完成继承状态字段写入 + 传播写 + clbs 配置。
7. 系统写审计日志。

**后置条件**：
- 用户反馈: 成功返回；服务端已记录资源自身的继承状态，权限解析按该状态和显式配置计算。

**成功标准**：

###### 异常路径

**EP-3（越权）**: 无 `manage` 权限用户修改继承控制 → 返回 `unAuthDataset`，数据不变。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 继承状态变更请求未携带 clbs（仅变更继承控制） | folder 允许（T-2 默认方案）；独立继承状态变更不改动任何 clbs |
| 继承状态变更与 clbs 配置同请求 | 在同一 mongo session 内原子完成（FR-5） |
| dataset 类型为 website/api 等非 folder | 允许设置继承状态字段，但不产生子资源传播（无 folder 子树） |
| 子树节点 10 层 dataset + 10 层 collection | 传播采用 BFS + 去重，受 NFR-2 阈值约束 |

---

##### 功能F006: 移动（move）时的权限处理 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 接口功能
**业务目标**: 移动 dataset / collection 到新父目录时，**保持资源自身的继承关系不变**——原继承态资源继续继承（按新父级合并权限），原独立态资源保持独立配置（仅更新 `parentId`），不允许通过 move 改变继承关系；确保移动后权限不泄漏、不残留（US-5）。
**技术目标**: 修复现有 move 恒置 `inheritPermission=true` 并同步父级 clbs 的「残留 BUG」（`projects/app/src/pages/api/core/dataset/update.ts:230`），改为**以资源自身继承态为策略**（读 DB 当前值，不接收请求参数）；复用 `checkMoveFolderDepth` 环/深度检测；整流程单事务。

**【如果是增量功能】相关现有功能**:
- 现有接口: `PUT /api/core/dataset/update` - 代码位置: `projects/app/src/pages/api/core/dataset/update.ts:102-147,245-276`（move 分支）
- 现有接口: `PUT /api/core/dataset/collection/update` - 代码位置: `projects/app/src/pages/api/core/dataset/collection/update.ts:70-147`（collection 更新，含 parentId 变更）
- 现有工具: `checkMoveFolderDepth` - 代码位置: `packages/service/common/parentFolder/depth.ts`（环/深度限制）
- 增量方向: update 接口**不新增 `inheritPermission` 参数**；move 分支以资源自身 `inheritPermission` 为策略执行权限同步（原继承态继承新父级，原独立态保持独立）。

**接口变更规格（增量）**:
- **dataset**: `PUT /api/core/dataset/update` 请求体**不含 `inheritPermission`**；`parentId` 为必传 move 标记（沿用现有：`parentId !== undefined` 判定为 move），move 时保持 dataset 自身的继承关系。
- **collection**: `PUT /api/core/dataset/collection/update` 请求体新增 `parentId`（移动目标，null=根），**不含 `inheritPermission`**；移动与改名可在同请求内，move 时保持 collection 自身的继承关系。
- **创建 dataset（含 folder）**: `POST /api/core/dataset/create`、`POST /api/core/dataset/folder/create`、`POST /api/core/dataset/createWithFiles` 请求体新增 `inheritPermission`（可选布尔，缺省 true=继承父级；false=创建为独立权限资源）。
- **move 鉴权**: source folder 与 dest folder 均需 `manage` 权限；移到根 / 从根移出需团队 dataset 创建权限（沿用 `authUserPer` + `TeamDatasetCreatePermissionVal`，`update.ts:126-133`）。

###### 输入定义（增量变更）

| 输入项 | 类型 | 来源 | 必填 | 约束条件 | 示例 |
|-------|------|------|------|---------|------|
| parentId | String(ObjectId) / null | 请求参数 | 是(move) | 目标父目录 id；null=根目录；dataset 的 parentId 必须为 folder 类型 dataset，collection 的 parentId 必须为 folder 类型 collection | "660b3f..." |
| inheritPermission（仅创建接口） | Boolean | 请求参数 | 否 | true=继承父级（默认）；false=创建为独立权限资源 | true |

**输入校验规则**:
1. `parentId` 非空时目标必须存在且类型为 folder → 否则 `unAuthDataset` / `unExist`。
2. 移动形成环（目标为自身的子级）或超出深度限制 → `CommonErrEnum.folderMoveDepthLimit`（`checkMoveFolderDepth`）。
3. 目标位置与来源位置需同时满足 manage 鉴权；涉及根目录需团队创建权限。
4. update / move 请求体不接受 `inheritPermission`，移动后的继承关系以资源当前 DB 值为准（不允许通过 move 变更继承关系）。

###### 输出定义（增量变更）

- 无新增响应字段；成功后返回现有更新接口的响应。
- 新增错误：`CommonErrEnum.folderMoveDepthLimit`（507007）— 移动形成环或超深度。

###### 正常路径

**前置条件**：
- 系统状态: 资源 R 存在，source 与 dest 目录存在且类型正确。
- 用户状态: 对 source 与 dest folder 均有 `manage` 权限（root 涉及团队创建权限）。
- 数据状态: 无环（`checkMoveFolderDepth` 通过）。

**触发条件**: 操作者提交 move（目标 parentId），接口不接收 `inheritPermission`，按资源 R 自身继承态处理。

**步骤**:
1. 用户提交 move 请求（仅目标 parentId）。
2. 系统鉴权 source / dest manage 权限、根目录团队创建权限。
3. 系统执行 `checkMoveFolderDepth`（环/深度）。
4. 系统在 mongo session 内，按 R 当前 `inheritPermission` 分支执行：
   a. 更新资源 `parentId`；保持 `inheritPermission` 不变（原继承态为 `true`、原独立态为 `false`）。
   b. **原继承态**：读取新父级 clbs（dest），将自身 clbs 全量替换为「dest 的 clbs（owner 位映射为 manage）+ 自身 owner 记录」；删除源目录特有非 owner 旧 clb，做到源目录权限**零残留**（见权威定义）。
   c. **原继承态且为 folder**：调用 `syncChildrenPermission` 将新父级 clbs 下发到所有继承态子资源。
   d. 若为 dataset move：额外同步到 `datasetId && type:folder` 的 collection（FR-6 第 5 条）。**原独立态**：仅更新 parentId，不执行新父级权限同步。
5. 系统写 move 审计日志。

**后置条件**：
- 系统状态（原继承态）: R 及其继承态子树 clbs = 新父级 clbs；源目录旧权限无残留。
- 数据状态（原独立态）: R 的 `parentId` 已更新，`inheritPermission=false`，自身 clbs 不变。
- 用户反馈: 成功；前端列表刷新。

**成功标准**：
- [ ] 原继承态移动后，R 的 clbs = dest 的 clbs（owner 位映射为 manage）+ 自身 owner 记录；源目录特有 clb 在 R 及子树上残留数为 0（逐条比对）。
- [ ] 原独立态移动后，R 及子资源 clbs 保持不变，`inheritPermission=false`。
- [ ] move 不改变 R 自身的继承关系（不接受 `inheritPermission` 请求参数）。

###### 异常路径

**EP-1（越权）**: 用户对 source 或 dest 任一缺少 manage 权限 → 返回 `unAuthDataset`，目标位置、权限数据均不变。
**EP-2（环/超深度）**: 目标为自身的子级 → 拒绝并返回 `folderMoveDepthLimit`，不产生部分移动。
**EP-3（根目录权限不足）**: 移到根/从根移出但无团队 dataset 创建权限 → 返回 `unAuthDataset`。
**EP-4（事务失败）**: 权限同步中途 DB 异常 → 整体回滚，R 保持在源目录原状态（parentId、clbs、inheritPermission 均不变）。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 移动到根目录（parentId=null） | dest clbs 为空集；原继承态下 R 自身 clbs 仅保留 owner，`inheritPermission=true`；原独立态下保持独立 clbs，`inheritPermission=false` |
| 从根目录移入文件夹 | 需团队创建权限；原继承态执行新父级同步，原独立态仅更新 parentId |
| 同一请求重复提交相同 move | 幂等：第二次执行同步结果一致，产生 0 净变更 |
| 移动的子树含冲突态非继承 folder | 仅同步继承态子资源；冲突态非继承子 folder 保留独立配置，不被覆盖 |
| dataset move 且该 dataset 下存在 folder collection | 这些 folder collection 同步为新 dataset 父级权限（FR-6 第 5 条） |
| 目标父级为自身 | `checkMoveFolderDepth` 环检测直接拒绝 |

---

##### 功能F007: 恢复继承 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 接口功能
**业务目标**: 将误配置的资源一键还原为干净的继承态（US-6）。
**技术目标**: 复用 `resumeInheritPermission`（`packages/service/support/permission/inheritPermission.ts:204-287`）；为 collection 新增对应接口。

**【如果是增量功能】相关现有功能**:
- 现有接口: `POST /api/core/dataset/resumeInheritPermission` - 代码位置: `projects/app/src/pages/api/core/dataset/resumeInheritPermission.ts:16-43`（dataset 恢复继承，manage 鉴权）
- 现有后台: `resumeInheritPermission` - 代码位置: `packages/service/support/permission/inheritPermission.ts:204-287`（folder 同步父级 + 下发子 folder；非 folder 清 clbs）
- 增量方向: 新增 collection 版接口；folder 恢复时同步恢复 `datasetId` 下所有 `inheritPermission=true` 的 folder collection。

**新增接口规格**:
- **接口路径**: `POST /api/core/dataset/collection/resumeInheritPermission`
- **鉴权**: 目标 collection `manage` 及以上。

**输入定义（新增接口）**

| 输入项 | 类型 | 来源 | 必填 | 约束条件 | 示例 |
|-------|------|------|------|---------|------|
| collectionId | String(ObjectId) | 请求参数 | 是 | 必须存在；否则 `unExistCollection` | "660b3f..." |

**输入校验规则**:
1. `collectionId` 缺失 → `CommonErrEnum.missingParams`。
2. 不存在 → `DatasetErrEnum.unExistCollection`。

**输出定义（新增接口）**

**成功响应**:
```json
{ "code": 200, "message": "success", "data": null }
```

**失败响应**:

| 错误码 | 错误信息(statusText) | 触发条件 | 处理建议 |
|-------|---------|---------|---------|
| 507004 | missingParams | collectionId 缺失 | 补齐参数 |
| 501003 | unExistCollection | collection 不存在 | 确认 ID |
| 501004 | unAuthDataset | 用户无 collection manage 权限 | 联系 owner |

###### 正常路径

**前置条件**：
- 系统状态: 目标 collection 存在。
- 用户状态: 持有 `manage` 及以上权限。
- 数据状态: 资源为独立配置态（含额外 clbs）或继承态。

**触发条件**: 管理员点击「恢复继承」。

**步骤**:
1. 用户提交 `collectionId`。
2. 系统 `authDatasetCollection` manage 鉴权。
3. 系统分支处理：
   - **有父级且为 folder**: 读取父级 clbs → 同步到自身（owner 降级 manage）→ 下发到所有 `inheritPermission=true` 的 folder 子资源 → 置 `inheritPermission=true`。
   - **有父级且非 folder**: 删除自身除 owner 外的 clbs → 置 `inheritPermission=true`（资源权限干净回到父级）。
   - **无父级**: 仅置 `inheritPermission=true`，无其他写操作。
4. folder 恢复时同步恢复 `datasetId` 下所有 `inheritPermission=true` 的 folder collection（对应树）。
5. 事务提交；写审计日志。

**后置条件**：
- 系统状态: 资源 `inheritPermission=true`。
- 数据状态: 非 folder 资源仅 owner clb；folder 资源 clbs = 父级 clbs（owner→manage 映射）+ 自身 owner 记录（父级 owner 以 manage 呈现）；无父级不存在的 clb 残留。
- 用户反馈: 成功。

**成功标准**：
- [ ] 独立配置文件恢复后 clbs 仅剩 owner，解析等于父级。
- [ ] 独立配置 folder 恢复后，F 及所有继承态子 folder 的 clbs = 父级 clbs（owner→manage 映射）+ 各自自身 owner 记录。
- [ ] 根级资源恢复仅置 `inheritPermission=true`。

###### 异常路径

**EP-1（越权）**: 用户无 manage 权限 → 返回 `unAuthDataset`，数据不变。
**EP-2（资源不存在）**: collectionId 不存在 → 返回 `unExistCollection`。
**EP-3（参数缺失）**: collectionId 缺失 → 返回 `missingParams`。
**EP-4（大批量子恢复失败）**: 子 folder 恢复中途失败 → 事务回滚，恢复前状态保持；重复调用结果一致（幂等）。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 资源已是继承态且 clbs 干净 | 幂等：调用后无净变更 |
| 根级资源（无父级） | 仅置 `inheritPermission=true`，不写其他 |
| 非 folder 资源含历史脏 clb | 恢复时全量清除（仅 owner 保留） |
| 子 folder 1000+ | BFS + `bulkWrite`，受 NFR-2 阈值约束 |
| 恢复后父级恰好无任何 clbs | 资源仅保留 owner clb，解析结果只有 owner |

---

##### 功能F009: 所有权转移 changeOwner (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 接口功能
**业务目标**: 将 dataset 或 collection 的所有权转移给同团队成员，正确处理新旧所有者权限冲突（US-9）。
**技术目标**: 复用 `changeOwner` 服务（`pro/admin/src/service/core/changeOwner.ts:34-224`）；为 collection 新增对应接口；扩展资源类型支持。

**【如果是增量功能】相关现有功能**:
- 现有接口: `POST /api/proApi/core/dataset/changeOwner` - 代码位置: `pro/admin/src/pages/api/core/dataset/changeOwner.ts:20-69`（owner 鉴权，校验新 owner 同团队）
- 现有后台: `changeOwner` - 代码位置: `pro/admin/src/service/core/changeOwner.ts:34-224`（递归子资源、clbs 冲突合并规则）
- 增量方向: 新增 collection 版接口；`changeOwner` 支持 `changeOwnerType='collection'` 与 `MongoDatasetCollection` 模型；子资源遍历改为 collection 树。

**新增接口规格**:
- **接口路径**: `POST /api/proApi/core/dataset/collection/changeOwner`
- **鉴权**: 目标 collection `owner` 权限。owner 仅来自该 collection **自身** owner 记录；经继承链从父级获得的上限为 manage（owner 位封顶，见权威定义），**不可**据父级 owner 身份对子 collection 执行 changeOwner。

**输入定义（新增接口）**

| 输入项 | 类型 | 来源 | 必填 | 约束条件 | 示例 |
|-------|------|------|------|---------|------|
| collectionId | String(ObjectId) | 请求参数 | 是 | 必须存在；否则 `unExistCollection` | "660b3f..." |
| ownerId | String(ObjectId) | 请求参数 | 是 | 必须为同团队有效成员（tmbId）；否则 `AppErrEnum.invalidOwner` | "u123" |

**输入校验规则**:
1. `collectionId` 或 `ownerId` 缺失 → `CommonErrEnum.missingParams`。
2. `ownerId` 对应成员不存在或 teamId 与资源不一致 → `AppErrEnum.invalidOwner`。
3. 操作者非资源 owner → `DatasetErrEnum.unAuthDataset`。

**输出定义（新增接口）**

**成功响应**:
```json
{ "code": 200, "message": "success", "data": null }
```

**失败响应**:

| 错误码 | 错误信息(statusText) | 触发条件 | 处理建议 |
|-------|---------|---------|---------|
| 507004 | missingParams | collectionId / ownerId 缺失 | 补齐参数 |
| 501003 | unExistCollection | collection 不存在 | 确认 ID |
| 501004 | unAuthDataset | 操作者非资源 owner | 仅 owner 可转移 |
| 502002 | invalidOwner | 新 owner 非本团队成员 | 选择本团队成员 |

###### 正常路径

**前置条件**：
- 系统状态: 目标资源存在；新 owner 为同团队成员。
- 用户状态: 持有资源 `owner` 权限。
- 数据状态: 资源树完整。

**触发条件**: owner 在资源设置中选择「转移所有权」并确认新 owner。

**步骤**:
1. 用户提交 `collectionId` + `ownerId`。
2. 系统 `authDatasetCollection({ per: OwnerPermissionVal })` 鉴权。
3. 系统校验新 owner 同团队。
4. 系统在 mongo session 内：
   a. 获取资源及其所有子资源（BFS）。
   b. 更新本资源 `tmbId=ownerId`，置 `inheritPermission=false`。
   c. 更新所有子资源 `tmbId=ownerId`（不改其 `inheritPermission`）。
   d. 同步更新关联外链 / OpenAPI 表 owner：collection 级**不同步**（T-4 已冻结）——外链/OpenAPI 记录绑定对象为 app（`OutLink.appId` 必填），collection 无独立外链/OpenAPI 资源形态，不存在「collection 已换 owner 但外链仍指向旧 owner」的记录；dataset 级沿用现有逻辑（`changeOwner.ts:136-157` 仅 app 类型更新外链/OpenAPI，dataset 类型不更新）。
   e. 更新 `resource_permissions`：
      - 新旧所有者都有权限：取两者 `Math.max`，删除新所有者记录，将旧所有者记录更新为新所有者 + 最大权限；
      - 仅旧所有者有权限：直接更新记录为新所有者；
      - 仅新所有者有权限：原样保留。
5. 系统写转移审计日志。

**后置条件**：
- 系统状态: 资源及子树 `tmbId=newOwner`；本资源 `inheritPermission=false`。
- 数据状态: clbs 冲突按规则合并；无重复/遗漏记录。
- 用户反馈: 成功。

**成功标准**：
- [ ] 转移后资源 `tmbId=N`、`inheritPermission=false`，所有子资源 owner 更新为 N。
- [ ] 新旧所有者均存在时，仅剩 N 的一条记录且 permission 为两者最大值。
- [ ] 仅旧所有者存在时，记录更新为 N，无第二条记录。
- [ ] 仅新所有者存在时，记录原样保留。
- [ ] collection 级转移不产生指向该 collection 的旧 owner 外链/OpenAPI 残留（collection 无独立外链/OpenAPI 记录；T-4 已冻结）。

###### 异常路径

**EP-1（非 owner 操作）**: 操作者非资源 owner → 返回 `unAuthDataset`，无任何变更。
**EP-2（跨团队 owner）**: 新 owner 与资源不同团队 → 返回 `AppErrEnum.invalidOwner`，无任何变更。
**EP-3（资源不存在）**: collectionId 不存在 → 返回 `unExistCollection`。
**EP-4（事务失败）**: clbs 合并或子资源更新中途失败 → 回滚，不产生「资源已换 owner 但权限表未更新」的中间态。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 新旧所有者相同 | 幂等：clbs 无需变更，`inheritPermission=false` 照写 |
| 新旧所有者在不同资源上各自有记录 | 每个子资源独立执行三条冲突规则 |
| 转移目标为 folder（含子资源树） | 本资源置非继承，子资源仅改 owner（保留各自继承态） |
| 新 owner 是旧 owner 的 group/org 成员 | group/org 记录不合并（仅处理 tmbId 记录），个人记录优先 |
| 转移后新 owner 同时拥有 owner clb 与旧记录 | 冲突规则 1 确保仅保留 max 权限单条记录 |
| 并发配置请求与转移同时发生 | 转移期间对资源的并发配置需串行或以后写为准（NFR-6） |
| 数据集 owner 对继承态子 collection 直接执行 changeOwner | **拒绝**：经继承链解析为 manage（owner 位封顶），不具备 owner 级操作权；转移子资源请以 dataset 为对象（递归子树）或为该 collection 直接配置 owner 记录（见权威定义） |
| collection 级外链/OpenAPI 记录 | 不存在此资源形态（外链绑定 app）；无需同步（T-4 已冻结） |

---

##### 功能F010: 存量权限一键升级 (全新功能)

###### 功能描述

**功能类型**: 全新功能
**功能实现类型**: 接口功能
**业务目标**: 系统管理员在权限继承逻辑升级后，从根开始按新逻辑重新配置所有权限，使存量数据自动迁移到新规则（US-10）。

**参考功能**:
- 可参考功能: `resumeInheritPermission` + `syncChildrenPermission` - 代码位置: `packages/service/support/permission/inheritPermission.ts:204-287,32-198`
- 参考价值: 逐资源重算可复用「父级 clbs → 自身 clbs」的同步原语；升级即对每个根递归应用恢复继承 + 冲突判定。

**新增接口规格**:
- **接口路径**: `POST /api/proApi/core/dataset/upgradePermission`（T-3 已冻结：HTTP API 暴露，面向系统管理员或团队 owner）
- **鉴权**: 系统管理员 或 团队 owner（任一满足即可；门槛高于普通 manage，属管理操作）。
- **幂等键**: `idempotencyKey` **必填**（防重并发；同键串行执行并返回首次结果）。

**输入定义**

| 输入项 | 类型 | 来源 | 必填 | 约束条件 | 示例 |
|-------|------|------|------|---------|------|
| teamId | String(ObjectId) | 请求参数 | 否 | 指定升级团队；缺省全量升级 | "team1" |
| idempotencyKey | String | 请求参数 | 是 | 幂等键，防止重复并发执行；同键重复请求返回首次结果（T-3 冻结为必填） | "upgrade-20260803-01" |
| rootDatasetId | String(ObjectId) | 请求参数 | 否 | 从指定根重跑（续跑失败根） | "660b3f..." |

**输入校验规则**:
1. 无团队 owner / 系统权限 → 拒绝。
2. `idempotencyKey` 缺失或非法 → `CommonErrEnum.missingParams` / `invalidParams`。
3. 幂等键重复且任务仍在执行 → 返回进行中，不重复执行。
4. 非法 ObjectId → 参数错误。

**输出定义**

**成功响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "rootCount": 128,
    "successRootCount": 126,
    "failedRoots": ["rootId_1"],
    "startAt": "2026-08-03T00:00:00Z",
    "endAt": "2026-08-03T00:05:00Z"
  }
}
```

**异步化（长任务，W-2 已冻结）**: 默认同步执行；当单次请求预计执行时长超过 NFR-2 预算（30s）时，返回 `202 Accepted` + `{ taskId, status: "running" }`，任务转入后台异步执行。异步任务经 `GET /api/proApi/core/dataset/upgradePermission/task/{taskId}` 查询状态与进度，响应含 `{ taskId, teamId, status: "pending|running|success|partial_failed|failed", progress, failedRoots, startAt, endAt }`；失败根经 `rootDatasetId` 续跑。任务记录存储于新增集合 `dataset_upgrade_tasks`（见 §3.1）。

**失败响应**:

| 错误码 | 错误信息(statusText) | 触发条件 | 处理建议 |
|-------|---------|---------|---------|
| 501004 | unAuthDataset | 非系统/团队 owner 调用 | 需管理员权限 |
| 507000 | invalidParams | 幂等键 / rootDatasetId 非法 | 修正入参 |
| 507005 | inheritPermissionError | 单根重算失败（单个根） | 通过 failedRoots 定位并续跑 |

###### 正常路径

**前置条件**：
- 系统状态: 存量库存在 move 残留权限、继承态非 folder 仍有 clb 等脏数据。
- 用户状态: 系统管理员 / 团队 owner。
- 数据状态: 数据表可读写。

**触发条件**: 管理员在升级窗口执行升级接口。

**步骤**:
1. 管理员提交升级请求（可带 teamId / 幂等键）。
2. 系统鉴权并检查幂等键。
3. 系统枚举根节点（无 `parentId` 的 dataset）。
4. 系统对每个根递归重算（BFS）：
   - 非 folder 继承态 → 清除除 owner 外 clbs，置 `inheritPermission=true`；
   - folder 继承态 → clbs = 父级 clbs（owner→manage 映射）+ 自身 owner 记录；
   - 冲突资源（子级与父级冲突）→ 置非继承态并保留独立配置；
5. 系统逐根记录进度日志；单根失败不阻断其余根。
6. 系统汇总返回（成功根数、失败根列表）。

**后置条件**：
- 系统状态: 全部资源满足新语义不变量（FR-14）。
- 数据状态: 脏数据清零。
- 用户反馈: 返回汇总结果；失败根可续跑。

**成功标准**：
- [ ] 升级后全部资源满足不变量（F013）：非 folder 继承态仅 owner clb、folder 继承态 clbs 经 owner→manage 映射后与父级一致且含自身 owner 记录、冲突资源非继承态。
- [ ] 升级完成后对任意资源校验结果与「新逻辑逐资源重算」一致。
- [ ] 抽样 ≥1000 个资源逐条对照一致率 100%（NFR-4）。

###### 异常路径

**EP-1（越权）**: 非系统/团队 owner 调用 → 返回 `unAuthDataset`，不执行。
**EP-2（单根失败）**: 某根重算中途失败 → 该根标记失败并记录日志，其余根继续；不产生重复/丢失（可重入续跑）。
**EP-3（重复并发执行）**: `idempotencyKey` 必填防重；缺失 → 返回 `missingParams`；同键并发 → 串行执行并返回首次结果。
**EP-4（升级与用户并发配置互相覆盖）**: 升级写入与用户配置并发 → 通过低峰执行 + 事务/行级 upsert 协调；升级期间对正在写入的资源加锁或后写优先。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 空库 / 无根节点 | 返回 rootCount=0，成功 |
| 单个根失败重跑 | 通过 rootDatasetId 从失败根续跑 |
| 存量数据已全部符合新语义 | 重算幂等，产生 0 净变更 |
| 树深超过常规（10 层 dataset + 10 层 collection） | BFS + 去重，受 NFR-2 超时阈值约束 |
| 单次执行超过 30s 预算 | 自动转异步任务（202 + taskId），经任务查询接口轮询进度（W-2 已冻结） |
| 升级中断 | 可重入：已重算根不受影响，未完成根从根重新执行 |

---

##### 功能F012: collection 增删改查权限门槛 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 接口功能
**业务目标**: 按文件级权限门槛控制 collection 的创建、修改、移动、查看、列表、删除操作（FR-13）。
**技术目标**: 将现有 `authDatasetCollection` 校验替换/升级为 collection 维度统一校验（F011），修正列表权限过滤与逐条过滤；列表过滤与检索链路（F014）复用同一「可读 collection 批量解析」（F011），避免两套解析逻辑分叉。

**【如果是增量功能】相关现有功能**:
- 现有接口: `POST /api/core/dataset/collection/create` - 代码位置: `projects/app/src/pages/api/core/dataset/collection/create.ts:19-25`（当前按 dataset write 鉴权，需改为「parent collection write 或 dataset write 及以上」）
- 现有接口: `PUT /api/core/dataset/collection/update` - 代码位置: `projects/app/src/pages/api/core/dataset/collection/update.ts:104-111`（当前按 collection write 鉴权，move 需 source+dest manage）
- 现有接口: `DELETE /api/core/dataset/collection/delete` - 代码位置: `projects/app/src/pages/api/core/dataset/collection/delete.ts:30-35`（collection write）
- 现有接口: `GET /api/core/dataset/collection/detail` - 代码位置: `projects/app/src/pages/api/core/dataset/collection/detail.ts:145-150`（collection read）
- 现有接口: `POST /api/core/dataset/collection/listV2` - 代码位置: `projects/app/src/pages/api/core/dataset/collection/listV2.ts:92-98,143-297`（当前按 dataset read 鉴权，需改为 parentId read 校验 + 逐条过滤）
- 现有鉴权: `authDatasetCollection` - 代码位置: `packages/service/support/permission/dataset/auth.ts:137-177`（当前透传 dataset 权限，需升级为 collection 维度）
- 增量方向: 各接口鉴权逻辑升级 + 列表权限过滤。

**操作门槛定义（FR-13）**:

| 操作 | 门槛 |
|------|------|
| create collection | parent collection `write` 或 dataset `write` 及以上 |
| update collection（改名/配置） | collection `write` 及以上 |
| move collection | source 与 dest folder `manage` 权限（含根目录团队创建权限） |
| detail / list collection | collection `read` 及以上 |
| delete collection | collection `write` 及以上（dataset/app 删除仍为 owner） |
| collection listV2 | 有 parentId 校验 parentId `read`；否则校验 dataset `read`；列表逐条权限过滤 |

**删除语义与清理（S-2 补充）**:
- 删除 collection：级联删除其子 collection 树（folder collection 含子树）及所有相关 `resource_permissions` 记录（`resourceId` 命中即删），删除与权限清理同一事务。
- 删除 dataset：级联删除其下全部 collection 及权限记录（沿用现有删除链）。
- 孤儿约束：任何删除不得残留孤儿 `resource_permissions` 记录（NFR-3 无残留扫描覆盖）。

###### 正常路径

**前置条件**：
- 系统状态: 目标 collection 存在；团队归属正常。
- 用户状态: 满足对应操作门槛。
- 数据状态: 无。

**触发条件**: 用户执行 collection 各 CRUD 操作。

**步骤**:
1. 用户调用对应接口。
2. 系统执行 collection 维度统一鉴权（F011：继承态取父级权限 → 自身 clbs → 叠加 group/org）。
3. 系统按操作门槛校验权限位（read/write/manage/owner）。
4. 系统执行业务逻辑并落库。
5. 系统写审计日志（create/update/delete 沿用现有事件）。

**后置条件**：
- 系统状态: 操作完成，权限数据满足不变量。
- 用户反馈: 成功响应。

**成功标准**：
- [ ] 用户对 dataset 有 write、对 C 无独立权限时，在 D 下创建 collection 成功。
- [ ] 用户对 C 仅 read 时调用 update（改名）返回 `unAuthDataset`。
- [ ] 用户对 source manage、dest 仅 read 时 move 返回 `unAuthDataset`。
- [ ] 用户对 C 有 read 无 write 时删除 C 返回 `unAuthDataset`。
- [ ] 用户对 dataset 无读权限但对独立配置的 C 有 read 时，`listV2` 列表包含 C 且不含其他无权限 collection。

###### 异常路径

**EP-1（create 越权）**: 用户对 parent 无 write 且对 dataset 无 write → 返回 `unAuthDataset`，不产生任何资源与权限记录。
**EP-2（move 越权）**: 用户对 source 或 dest 任一无 manage → 返回 `unAuthDataset`，目标位置与权限数据不变。
**EP-3（delete 越权）**: 用户对 C 有 read 无 write → 返回 `unAuthDataset`。
**EP-4（list 越权泄漏）**: 列表接口不得返回用户无权限的 collection（逐条过滤）；越权响应不泄露资源信息。
**EP-5（资源归属损坏）**: collection 与 dataset 团队不一致 → 返回 `unAuthDataset`（沿用 `auth.ts:165-167` 守卫）。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 根级文件 collection（parentId 为空） | 创建门槛退化为 dataset write；鉴权父级取 `datasetId` |
| 继承态非 folder collection | 鉴权沿 parentId/datasetId 链向上解析到有效权限 |
| listV2 在 10,000 条 collection 上过滤 | 逐条内存解析 + `$in` 批量加载 clbs，避免 N+1（NFR-1） |
| 搜索场景（listV2 带 searchText） | 无 parentId 时按 dataset read 鉴权，结果逐条过滤 |
| 用户对同一 collection 命中 tmbId(read) + group(write) | 最终权限 = read\|write（按位 OR） |
| 用户对 C 无任何记录 | 校验结果无权限（拒绝） |
| 删除 folder collection（含子树） | 级联删除子 collection 及其 `resource_permissions` 记录；删除与清理同一事务，失败回滚（S-2） |
| 分页 pageSize 上限 | 沿用现有 `Math.min(rawPageSize, 100)`（`listV2.ts:86`） |

---

##### 功能F014: 知识库检索（RAG 召回）按文件级权限过滤 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 后台功能（检索链路过滤逻辑）
**业务目标**: 将知识库检索（KB 检索 / RAG 召回）的召回结果**按文件级（collection 级）权限过滤**：用户仅能召回其解析后具有 read 及以上权限的 collection 内容；无 read 权限的 collection 内容不得出现在任何召回结果中，且不可经 folder 递归展开或 dataset 级权限绕过（US-11 / FR-11）。
**技术目标**: 在既有 dataset 级 read 入口鉴权（`authDataset`）之上，叠加 collection 级「可读 collection 批量解析」（F011：输入 tmbId + 候选 collectionId 集合，输出可读子集），对召回候选集合（含 folder 递归展开后的实际文件）做交集过滤；过滤为纯读、批量（`$in`）、支持短路与缓存（NFR-7/NFR-8）。

**【如果是增量功能】相关现有功能**:
- 现有接口: `POST /api/core/dataset/searchTest` - 代码位置: `projects/app/src/pages/api/core/dataset/searchTest.ts`（检索入口，dataset 级 read 鉴权 `authDataset`）
- 现有接口: `GET /api/core/dataset/collection/read` - 代码位置: `projects/app/src/pages/api/core/dataset/collection/read.ts:28-33`（collection read 鉴权）
- 现有后台: `defaultSearchDatasetData` / `deepRagSearch` - 代码位置: `packages/service/core/dataset/search/`（对话 KB 召回）
- 现有后台: `filterCollectionByMetadata` - 代码位置: `packages/service/core/dataset/search/defaultRecall/collectionFilter.ts`（folder collectionIds 递归展开为实际文件，为文件级过滤候选挂载点）
- 现有鉴权: `authDatasetData` - 代码位置: `packages/service/support/permission/dataset/auth.ts:182-233`（数据权限继承自 collection）
- 增量方向: F011 新增「可读 collection 批量解析」能力并供检索链路复用；检索链路在召回前叠加可读集合交集；`authDatasetCollection` 由透传 dataset 权限改为 collection 维度解析（T-7 默认方案：以新增独立解析函数控制回归面）。

**过滤挂载点（T-7 默认方案）**: 召回前预过滤——在 `collectionFilter.ts` 的 collectionIds 展开处叠加「候选集合 ∩ 可读集合」，先裁剪候选再执行 embedding/fullText 召回；对全继承态 dataset 走短路路径（可读集合 = 全量候选，跳过逐 collection 解析，近似零额外开销）。

###### 接口与数据格式说明

- 对外检索请求入参**不变**（`datasetId` 仍为入口，沿用 `SearchDatasetTestBodySchema` 等 schema），无新增/变更字段，向后兼容。
- 内部新增解析入参: `tmbId`（OpenAPI 检索取 apikey 关联 tmbId）+ 候选 collectionId 集合（或 datasetId，内部经 folder 展开）；输出: 可读 collectionId 子集（F011 批量解析）。
- 错误语义: 用户对 dataset 无 read → 沿用 `DatasetErrEnum.unAuthDataset`（入口行为不变）；对单个 collection 无 read → **静默过滤**（该 collection 内容不出现，不报错、不泄露「存在但无权」信息）。

###### 正常路径

**前置条件**：
- 系统状态: 检索链路已接入「可读 collection 批量解析」（F011）；候选集合可经 `collectionFilter` 展开为实际文件。
- 用户状态: 已登录（或携带合法 apikey），通过 dataset 级 read 入口鉴权。
- 数据状态: 目标 dataset 下 collection 权限数据完整（继承态 / 独立态）。

**触发条件**: 用户在对话 / searchTest / OpenAPI 对 dataset D 发起检索。

**步骤**:
1. 系统执行 dataset 级 read 入口鉴权（`authDataset`）。
2. 系统收集候选 collection 集合，经 folder 递归展开为实际文件（`collectionFilter`）。
3. 系统调用「可读 collection 批量解析」（F011）：批量加载 clbs（`$in`）+ 内存解析，输出用户可读子集。
4. 系统将候选集合与可读子集求交集，对交集执行 embedding/fullText 召回。
5. 系统返回命中结果（仅含可读 collection 内容）。

**后置条件**：
- 系统状态: 无状态变更（纯读过滤，不落库）。
- 用户反馈: 返回召回结果；无 read 权限的 collection 内容不出现，不报错。

**成功标准（FR-11 验收口径）**：
- [ ] 仅文件级 read 权限 collection 被召回：Given A 对 D 下 C1（独立配置，A 解析 read=0）、C2（继承态，A 可读）且 A 有 dataset read，When A 检索 D（searchTest / 对话召回），Then C1 命中数为 0、C2 命中正常返回（越权召回为 0）。
- [ ] 越权召回为 0：任意「用户 × collection 权限」负向组合下，无 read collection 在召回结果中出现次数 = 0（NFR-8）。
- [ ] 漏召回为 0：对 A 有 read（含经 group/org 叠加获得）且 query 语义命中的 collection，结果全部包含，过滤不误删（NFR-8）。
- [ ] 继承与独立语义一致：继承态可检索性与父级（folder/dataset）解析一致；独立态且排除 A 的 collection 即使 A 有 dataset read 也不可召回。
- [ ] folder 展开不可绕过：A 可读 folder F 下独立态且 A 无 read 的文件 C，经 F 的 collectionIds 展开后仍不可召回（展开后逐文件过滤）。
- [ ] 全路径一致：searchTest / 对话 KB 召回 / OpenAPI 检索复用同一「可读 collection 批量解析」函数，代码可验证无旁路绕过。
- [ ] 存量等价回归：未配置独立权限（全继承态）dataset 升级前后对同一 query 召回结果一致（与既有 dataset 级行为等价）。

###### 异常路径

**EP-1（入口越权）**: 用户对 dataset 无 read → 返回 `DatasetErrEnum.unAuthDataset`，不执行召回（入口行为不变，HTTP 状态沿用现有错误码体系）。
**EP-2（可读集合解析失败）**: 批量解析中途 DB 异常 → 降级**不放大权限**：按「最小可读集合」（空集）处理该次召回或拒绝该次召回；绝不因解析失败导致越权召回（FR-12 降级约束，fail-closed）。
**EP-3（OpenAPI apikey 无关联 tmbId / tmbId 解析失败）**: 按 apikey 关联 tmbId 语义解析失败 → 该次检索可读集合为空，不返回任何 collection 内容（fail-closed，不泄露资源存在性）。
**EP-4（过滤后候选为空）**: 可读集合与候选集合交集为空 → 返回空召回结果（正常空响应，不报错）。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 用户仅对文件 C 有 collection read、无 dataset read | 检索入口仍需 dataset read（入口行为不变）；文件级过滤不改变入口鉴权；管理端列表按 F012 放行 |
| 继承态 collection | 可检索性与父级（folder/dataset）解析一致；全继承态 dataset 走短路路径（可读集合=全量候选，近似零开销） |
| 独立态且排除用户的 collection | 即使 A 有 dataset read，内容仍不可召回（越权召回为 0） |
| folder 递归展开绕过 | 展开后逐文件过滤：A 可读 folder F 下独立态且 A 无 read 的文件 C 仍不可召回（FR-11 验收 5） |
| searchTest / 对话 KB 召回 / OpenAPI 三入口 | 复用同一「可读 collection 批量解析」函数（代码可验证，无旁路绕过；FR-11 验收 7） |
| 高并发检索（单 API 100 QPS） | 解析批量 `$in` + 缓存/短路，沿用读从库 `readFromSecondary`；P95 见 NFR-7 |
| 权限变更后立即重发检索 | 读取最新权限，无陈旧缓存导致越权召回（NFR-8） |
| 存量未配置独立权限（全继承态） | 与既有 dataset 级行为等价（升级前后召回一致，NFR-4） |
| 配置文件级 write/manage 的用户 | 因角色累计位含 read，该 collection 内容可召回（门槛为解析后 read 及以上） |

---

#### 2.2.2 后台功能

---

##### 功能F001: collection 级权限数据模型与继承解析 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 后台功能
**业务目标**: 为单个 collection（文件或文件夹）建立独立权限配置能力：`inheritPermission` 字段 + collection 维度 clbs 存储 + 父级权限来源解析，使同一 dataset 下不同 collection 可解析出不同最终权限（US-1 / US-7 底座）。
**技术目标**: 新增 collection schema 字段；扩展 `resource_permissions` 资源类型（T-1）；实现 collection 维度解析（F011 底座）；并暴露「可读 collection 批量解析」能力（输入 tmbId + 候选 collectionId 集合，输出可读子集，批量 `$in`、DB 查询次数为常数），供检索链路（F014）、列表过滤（F012）、数据级鉴权（authDatasetData）复用。

**【如果是增量功能】相关现有功能**:
- 现有数据模型: `dataset_collections`（`MongoDatasetCollection`） - 代码位置: `packages/service/core/dataset/collection/schema.ts:13-87`（当前**无** `inheritPermission`）
- 现有数据模型: `resource_permissions`（`MongoResourcePermission`） - 代码位置: `packages/service/support/permission/schema.ts:14-59`（`resourceType` 枚举 `PerResourceTypeEnum` 不含 `collection`，见 `packages/global/support/permission/constant.ts:48-54`）
- 增量方向: 字段新增 + 枚举扩展 + 解析逻辑。

**数据模型变更（字段级）**:

| 集合 | 字段 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| dataset_collections | inheritPermission | Boolean | true | 新增；true=继承父级，false=独立态 |
| dataset_collections | permissionVersion | Number | 1 | **新增**（现有 schema 无此字段，N4 冻结）；乐观并发控制版本号 CAS（S-4 选型落地） |
| datasets | permissionVersion | Number | 1 | **新增**（现有 schema 无此字段，N4 冻结）；乐观并发控制版本号 CAS（S-4 选型落地） |
| resource_permissions | resourceType | String | - | 枚举扩展：新增 `collection`（T-1 默认方案） |

**继承解析规则（F001 + F011 统一）**:

```
resolvePermission(resourceId, resourceType, tmbId):
  R = 查询资源 { inheritPermission, parentId, datasetId, type }
  # 1. 父级有效权限
  if inheritPermission == true 且 存在父级:
     父引用 = (资源为 collection) ? (parentId 非空 ? parentId : datasetId) : (parentId 非空 ? parentId : 无)
     # 父类型显式判定（N2 冻结）：消除箭头记法对 folder dataset 的无定义分支
     #   collection 资源          → parentId 非空 ? 'collection' : 'dataset'
     #   dataset 资源（含 folder dataset，parentId 非空）→ 恒为 'dataset'
     #     （folder dataset 的父级是 resourceType='dataset' 的 folder；若以 'collection' 递归查询 resource_permissions
     #       将查不到父级记录，权限解析静默失效——fail-open/fail-closed 均不可接受）
     父类型 = 资源为 collection ? (parentId 非空 ? 'collection' : 'dataset') : 'dataset'
     parentEffective = resolvePermission(父引用, 父类型, tmbId)   # 递归直到根
  else:
     parentEffective = 0
  # 2. 父级 owner 位封顶（继承透传规则，与落库规则一致，见 §2.2 权威定义）：
  #    父级 owner 经继承链授予子资源的上限为 manage，不透传 owner
  parentContribution = (parentEffective == OwnerRoleVal) ? ManageRoleVal : parentEffective
  # 3. 自身 clbs（tmbId 优先，其次 groupId/orgId 集合 sumPer）
  myPer = getTmbPermission(resourceType, teamId, tmbId, resourceId)
  # 4. 合并：sumPer 为按位 OR、幂等，与继承态 folder 落库快照一致，无重复计数
  return sumPer(parentContribution, myPer)
```

**继承 / 独立状态转换规则**:

| 当前状态 | 触发操作 | 目标状态 | 数据动作 |
|---------|---------|---------|---------|
| 继承态（inheritPermission=true） | 配置与父级冲突（F008） | 独立态 | 置 false；folder 全量下发 clbs 到继承态子 folder |
| 继承态 | 配置与父级无冲突 | 保持继承态 | 仅增量更新自身 clbs |
| 独立态 | 恢复继承（F007） | 继承态 | 同步父级 clbs / 清空自身非 owner clb |
| 任意 | move 选择继承新父级（F006） | 继承态 | 同步新父级 clbs，源权限零残留 |
| 任意 | changeOwner（F009） | 独立态（本资源） | 置 false；子资源仅改 owner |


| 继承控制 | 配置权限 P 于 folder F 时 | 创建子资源时 | 继承控制切换时 |
|------|--------------------------|--------------|-----------|


###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 根级文件 collection（parentId 为空） | 父级来源取 `datasetId`（collection 层级取 dataset 权限） |
| folder dataset（parentId 非空）继承解析（N2 正向用例） | 父类型显式判定为 `'dataset'`，沿 parentId 链向根解析（父级为 folder 类型 dataset）；不得落入 `'collection'` 分支查询 `resource_permissions`，否则父级记录查不到、解析静默失效 |
| folder collection 继承态 | clbs = 父级 clbs（owner→manage 映射）+ 自身 owner 记录；父级 owner 以 manage 呈现（见权威定义） |
| 继承态非 folder | 查询 `resource_permissions` 返回 ≤1 条（仅 owner） |
| 同一 collection 命中 tmbId 与所属 group | 取两者 sumPer 最高权限（个人与 group/org 叠加） |
| 递归链环（父级指回自身） | 解析需防环（继承链构建时 visited 去重；move 已有 checkMoveFolderDepth 防环） |
| 继承态解析 | 不落库，仅查询时合成，无写并发 |
| 批量可读解析（检索/列表复用） | 输入 tmbId + 候选 collectionId 集合：clbs 批量加载（`$in`）+ 内存解析，单请求 DB 查询次数为常数；folder 候选先展开为实际文件再过滤；解析失败降级为最小可读集合（不放大权限，NFR-8） |

---

##### 功能F004: 创建资源时默认继承父级权限 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 后台功能
**业务目标**: 创建 collection / dataset 时自动按父级继承控制决定继承/独立状态，folder 创建时正确合并父级 owner 降级（US-3）。
**技术目标**: 在 `createOneCollection` / dataset 创建流程中执行「关联创建」权限初始化，与资源创建同一事务。

**【如果是增量功能】相关现有功能**:
- 现有后台: `createOneCollection` - 代码位置: `packages/service/core/dataset/collection/controller.ts:276-315`（当前只建资源，不写权限）
- 现有后台: `createResourceDefaultCollaborators` - 代码位置: `packages/service/support/permission/controller.ts:181-240`（dataset 创建时写权限：**全量拷贝父级 clbs，父级 owner 降级为 manage，追加自身 owner 记录**——R1 对齐实际实现，避免实现方误读为「仅 owner 拷贝」而破坏不变量 #2）

**逻辑规则**:
4. 创建 folder 时的 clbs 携带，按父级继承控制分两类（规则 4 与规则 3 衔接口径，N1 冻结）：

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 用户对父目录仅 write | create collection 鉴权通过（parent write 或 dataset write） |
| 用户对父目录无 write | 返回 unAuthDataset，不产生资源与权限记录 |
| 创建与权限初始化事务 | 同一 mongo session；失败回滚，不残留无主资源或无主权限记录 |
| 防重名/重复提交 | 创建接口防重名/重复提交产生的孤儿权限（事务内创建资源+写权限） |

---


###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 后台功能
**技术目标**: 继承状态变更时 BFS 遍历子资源，将 `inheritPermission` 统一置 false；与继承控制写入同事务。

**【如果是增量功能】相关现有功能**:
- 现有后台: `syncChildrenPermission` - 代码位置: `packages/service/support/permission/inheritPermission.ts:32-198`（BFS + bulkWrite 模式可复用/反用）

**逻辑规则**:
3. 已设置独立配置的子资源保持其独立 clbs 不变，仅状态翻转。
4. 变更与 F 自身权限配置在同一次请求内原子生效（事务）。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 子资源数量大 | BFS + `bulkWrite` 批量化，禁止逐条 await（NFR-2） |
| 变更中途失败 | 事务回滚，F 与子资源保持变更前状态 |
| 子资源已有独立配置 | 仅置 false，不覆盖 clbs |
| 子资源为继承态 folder 链 | 全部置 false（含深层 folder 及其文件） |
| 变更后用户查询子资源权限 | 不再解析到 F 的权限（与变更前比权限不放大） |

---

##### 功能F008: 权限冲突检测与自动取消继承 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 后台功能
**业务目标**: 配置资源权限时检测与父级的冲突，冲突则自动取消继承并保留独立配置；权限变大则无需冲突继续继承（US-8）。
**技术目标**: 扩展 `checkRoleUpdateConflict`（`packages/global/support/permission/utils.ts:34-68`）为 wiki 修订版冲突规则；冲突判定与状态写入同事务。

**【如果是增量功能】相关现有功能**:
- 现有工具: `checkRoleUpdateConflict` - 代码位置: `packages/global/support/permission/utils.ts:34-68`
- 现有工具: `getChangedCollaborators` - 代码位置: `packages/global/support/permission/utils.ts:90-145`（变化位取最低位）
- 现有后台: `updateResourceCollaborators` - 代码位置: `pro/admin/src/service/support/permission/controller.ts:196-319`（冲突分支：置非继承 + folder 全量替换）

**冲突判定规则（wiki 修订版）**:
```
输入: parentClbs, newChildClbs
冲突条件（满足任一）:
  1. 变化位取最低位后: (parent 存在) && ((changedRole & parent.permission) !== 0 || deleted)
     语义: 权限变小(写→读) 或 删除父级已有协作者 → 冲突；权限变大(读→写) → 无冲突
  2. 补充规则:
     - 父所有者在子为 manage 或 owner，否则冲突
     - 子的所有者，在父为 write/manage/owner，否则冲突
     - 其余协作者只要不同即冲突
```

**行为规则**:
1. 冲突时（且继承态 + 有父级）→ 自动置 `inheritPermission=false`，保留独立配置；folder 需全量下发 clbs 到继承态子 folder。
2. 无冲突时 → 保持继承态，仅增量更新自身 clbs。
3. 冲突本身不是错误，是触发「取消继承」的正常分支；仅无权限时才报错。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 父权限 read、子配置 write（比父小） | 冲突 → 置非继承态，clbs 为独立配置（write 语义完整保留） |
| 父权限 read、子配置 manage（比父大） | 无冲突 → 保持继承态，仅增量更新 |
| 删除（deleted）父级已有协作者 | 判定冲突并取消继承 |
| folder 子资源冲突取消继承 | 所有继承态子 folder 获得全量 clbs 同步 |
| 父级无任何 clbs | 冲突判定直接返回 false（无冲突） |
| 非 folder 冲突取消继承 | 仅置 false，保留独立配置，不同步子级 |
| 冲突判定与状态写入并发 | 同一事务内完成 |

---

##### 功能F011: 统一权限校验逻辑 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 后台功能
**业务目标**: 实现可复用的统一权限校验，供 dataset / collection / data 三层复用，输入 `resourceId` + `tmbId`（FR-12）。
**技术目标**: 抽取通用解析原语；collection 获取父级权限来源为 `parentId`、`datasetId`；以**批量可读解析**形式暴露（输入 tmbId + 候选 collectionId 集合，输出可读子集），供检索链路（F014）、列表过滤（F012）、数据级鉴权（authDatasetData）复用；纯读无写，需高并发优化（NFR-7）。

**【如果是增量功能】相关现有功能**:
- 现有鉴权: `authDatasetByTmbId` - 代码位置: `packages/service/support/permission/dataset/auth.ts:28-100`（dataset 维度校验顺序）
- 现有鉴权: `authDatasetCollection` - 代码位置: `packages/service/support/permission/dataset/auth.ts:137-177`（当前透传 dataset 权限，需升级）
- 现有查询: `getTmbPermission` - 代码位置: `packages/service/support/permission/controller.ts:31-104`（tmbId 优先 + group/org 集合）
- 增量方向: 增加 collection 分支；统一解析顺序。

**校验顺序（统一）**:
```
folderPer（继承态且有父级则取父级权限，否则 0；父级 owner 位封顶为 manage，不透传 owner）
→ myPer（自身 clbs：tmbId/groupId/orgId 三路取最高）
→ 最终 = sumPer(folderPer封顶, myPer)
```

**子资源定义**:
- dataset 的子资源: `type=folder 且 parentId=当前id` 的 dataset；以及该 dataset 下所有 collection。
- collection 的子资源: `type=folder 且 parentId=当前id` 的 collection。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 继承态文件 C（parentId→F→D 链） | 沿 C→F→D 向上解析到 D 的有效权限（D 非继承态取 D 自身 clbs） |
| 非继承态文件 C 有自身 clbs | 解析结果为自身 clbs，不混入父级 |
| 用户同时命中 tmbId(read) 与 group(write) | 最终权限 = read\|write |
| 用户无任何记录 | 校验结果无权限（拒绝） |
| 资源不存在 | 返回 `unExist` |
| 纯读高并发 | clbs 批量加载（`$in`）+ 内存解析，避免 N+1（NFR-1） |
| 继承链防环 | 向上解析时 visited 去重 |
| 批量可读解析（供检索/列表复用） | 输入 tmbId + 候选集合：批量 `$in` 加载 clbs 内存解析，DB 查询次数为常数；解析失败降级为最小可读集合（fail-closed，不放大权限，NFR-8） |

---

##### 功能F013: 权限数据存储与同步一致性 (增量功能)

###### 功能描述

**功能类型**: 增量功能
**功能实现类型**: 后台功能
**业务目标**: 保证权限数据在任意时刻满足继承/独立状态不变量（FR-14）。
**技术目标**: 所有写路径统一 `mongoSessionRun` 事务；对同一资源路径的并发写采用**乐观并发控制**（资源文档 `permissionVersion` 版本号 CAS，S-4 已选型），版本冲突返回 `inheritPermissionError`(507005) 提示重试。

**【如果是增量功能】相关现有功能**:
- 现有事务工具: `mongoSessionRun` - 代码位置: `packages/service/common/mongo/sessionRun.ts`
- 现有同步原语: `syncCollaborators` / `syncChildrenPermission` / `resumeInheritPermission` - 代码位置: `packages/service/support/permission/inheritPermission.ts`

**数据不变量（FR-14）**:
1. 继承态非 folder 资源: `resource_permissions` 中仅 owner 记录（查询返回 ≤1 条）。
2. 继承态 folder 资源: clbs = 父级 clbs 的「owner→manage 映射副本」+ 自身 owner 记录。等价验收：将 folder 的 clbs 与父级 clbs 逐条对照，满足 (a) 父级每条记录在 folder 中有对应记录（父级 owner 在 folder 中 permission=manage）；(b) folder 额外仅含自身 owner 记录（permission=owner）；(c) folder 不含其余独立 clbs。
3. 非继承态资源: 拥有独立 clbs 配置（含自身 owner 记录）。
4. folder 配置权限时向**继承态**子 folder 下发全量 clbs（仅 `inheritPermission=true` 子 folder，T-6 已冻结；非继承子 folder 不被覆盖）。
5. 冲突取消继承与下发、move、恢复继承等写路径均在同一事务内完成，任一步失败回滚。
6. 父级 owner 位经继承链封顶为 manage，不透传 owner（解析与落库一致，见权威定义）。

###### 边界条件处理

| 边界条件 | 处理方式 |
|---------|---------|
| 任意写操作完成后 | 对受影响子树做完整性扫描，违反不变量的资源数为 0 |
| 写操作中途 DB 异常 | 事务回滚，数据保持操作前状态（无半写） |
| 同一子树并发两个写操作 | 乐观并发控制（`permissionVersion` CAS）：版本不一致返回 `inheritPermissionError`(507005)，提示重试；无丢失更新（S-4 已选型） |
| 事务失败 | 返回明确错误并记录审计日志 |
| 权限写接口（collaborator update / changeOwner / resume / 升级） | 100% 校验 manage/owner 门槛 |

---

### 2.3 功能点分析与估算

### FP-1: collection schema 字段扩展与 resourceType 枚举扩展
**类型**: CRUD（schema）
**复杂度**: 简单
**验收测试**: schema 单测、枚举校验、存量数据读取
**预计工作量**: 8 小时

### FP-2: 统一权限校验解析（F001/F011）
**类型**: 处理
**复杂度**: 复杂
**描述**: 抽象 `resolvePermission`（继承链 + 自身 clbs + group/org 叠加）；`authDatasetCollection` 升级为 collection 维度；新增「可读 collection 批量解析」（输入 tmbId + 候选集合，批量 `$in`、常数 DB 查询）供检索链路（F014）与列表过滤（F012）复用。
**验收测试**: 正/负向解析单测（继承链、group 叠加、无权限拒绝）；批量可读解析正确性（100 可读/900 不可读恰返回 100）与常数 DB 查询次数
**预计工作量**: 32 小时

### FP-3: collection 协作者配置接口（F002/F008）
**类型**: 集成
**复杂度**: 复杂
**描述**: `/api/proApi/core/dataset/collection/collaborator/update`；全量 clbs 下发 + 继承状态变更 + 冲突取消继承 + folder 下发；事务与审计。
**验收测试**: 配置、越权、自身保护、冲突取消继承、folder 同步、事务回滚
**预计工作量**: 40 小时

### FP-4: 创建资源默认继承与显式非继承子集（F004）
**类型**: 处理
**预计工作量**: 16 小时

### FP-5: 移动权限处理（F006）
**类型**: 处理
**复杂度**: 复杂
**描述**: update 接口 move 策略参数；继承新父级 / 保持独立；源权限零残留；环/深度检测。
**验收测试**: 两种策略、越权、环、残留比对
**预计工作量**: 24 小时

### FP-6: 恢复继承接口（F007）
**类型**: 处理
**复杂度**: 中等
**描述**: `/api/core/dataset/collection/resumeInheritPermission`；folder 级联恢复；幂等。
**验收测试**: 文件/folder/根三级恢复、越权、幂等
**预计工作量**: 16 小时

### FP-7: 所有权转移扩展（F009）
**类型**: 处理
**复杂度**: 复杂
**描述**: `/api/proApi/core/dataset/collection/changeOwner`；子资源 owner 更新；clbs 冲突合并三规则。
**验收测试**: 三规则、越权、跨团队、事务
**预计工作量**: 24 小时

### FP-8: 存量一键升级（F010）
**类型**: 集成
**复杂度**: 复杂
**描述**: `/api/proApi/core/dataset/upgradePermission`；从根递归重算；幂等/重入；逐根日志。
**验收测试**: 脏数据迁移、单根失败续跑、重入、一致率抽样
**预计工作量**: 32 小时

### FP-9: collection CRUD 权限门槛与列表过滤（F012）
**类型**: 查询
**复杂度**: 中等
**描述**: 各接口鉴权升级；listV2 逐条过滤 + clbs 批量加载。
**验收测试**: 各门槛正/负向、列表过滤正确性、10,000 条性能
**预计工作量**: 24 小时

### FP-10: 检索（RAG 召回）文件级权限过滤（F014）
**类型**: 处理
**复杂度**: 复杂
**描述**: 在检索链路（searchTest / 对话 KB 召回 / OpenAPI）叠加「可读 collection 批量解析」过滤：召回前在 collectionIds 展开处预过滤（T-7 默认方案）；三入口复用同一过滤函数；全继承态短路路径；过滤回归用例集 + 性能基线。
**验收测试**: 越权召回=0、漏召回=0、folder 展开不可绕过、三入口一致、存量等价回归、端到端 P95 退化 ≤15%
**预计工作量**: 32 小时

### FP-11: 隐藏路径穿透平铺与知识库门槛（F016/F017）
**类型**: 查询
**复杂度**: 复杂
**描述**: 对隐藏祖先路径执行知识库 read 门槛校验，仅允许知识库级可读主体平铺展示；仅文件授权不泄露知识库或文件。
**验收测试**: 隐藏路径平铺、无知识库权限、仅文件权限、路径泄露和分页一致性
**预计工作量**: 24 小时

### FP-12: 当前路径限定搜索（F018）
**类型**: 查询
**复杂度**: 复杂
**描述**: 服务端以规范化当前路径/父资源谓词直接约束查询范围，并叠加知识库和 collection read 过滤，禁止全局搜索后截断。
**验收测试**: 当前路径、空路径、无权路径、非法路径、分页排序和性能
**预计工作量**: 24 小时


| 功能点 | 类型 | 复杂度 | 工作量 |
|--------|------|--------|--------|
| FP-1: schema/枚举扩展 | CRUD | 简单 | 8 小时 |
| FP-2: 统一权限校验 | 处理 | 复杂 | 32 小时 |
| FP-3: collection 协作者配置 | 集成 | 复杂 | 40 小时 |
| FP-4: 创建继承/停止继承 | 处理 | 中等 | 16 小时 |
| FP-5: 移动权限处理 | 处理 | 复杂 | 24 小时 |
| FP-6: 恢复继承接口 | 处理 | 中等 | 16 小时 |
| FP-7: 所有权转移扩展 | 处理 | 复杂 | 24 小时 |
| FP-8: 存量一键升级 | 集成 | 复杂 | 32 小时 |
| FP-9: CRUD 门槛与列表过滤 | 查询 | 中等 | 24 小时 |
| FP-10: 检索文件级过滤 | 处理 | 复杂 | 32 小时 |
| FP-11: 隐藏路径平铺与知识库门槛 | 查询 | 复杂 | 24 小时 |
| FP-12: 当前路径限定搜索 | 查询 | 复杂 | 24 小时 |
| **总计** | | | **296 小时** |

### 2.4 场景覆盖矩阵

| 功能 | 正常路径 | 异常路径数 | 边界条件 | 接口/后台 |
|------|---------|-----------|---------|----------|
| F001 | ✅ | 2 | 8 | 后台 |
| F002 | ✅ | 5 | 8 | 接口 |
| F004 | ✅ | 2 | 8 | 后台 |
| F006 | ✅ | 4 | 7 | 接口 |
| F007 | ✅ | 4 | 6 | 接口 |
| F008 | ✅ | 2 | 7 | 后台 |
| F009 | ✅ | 4 | 6 | 接口 |
| F010 | ✅ | 4 | 5 | 接口 |
| F011 | ✅ | 2 | 7 | 后台 |
| F012 | ✅ | 5 | 7 | 接口 |
| F013 | ✅ | 2 | 5 | 后台 |
| F014 | ✅ | 4 | 9 | 后台 |
| F015 | ✅ | 4 | 7 | 接口 |
| F016 | ✅ | 4 | 7 | 接口 |
| F017 | ✅ | 3 | 5 | 后台 |
| F018 | ✅ | 4 | 6 | 接口 |

---

## 3. 静态结构分析

### 3.1 数据表变更分析

#### MongoDB 数据表变更

**需要修改的表**:

| 表名 | 数据库 | Schema | 修改内容 | 修改目的 |
| ---- | ------ | ------ | -------- | -------- |
| `resource_permissions` | MongoDB | `packages/service/support/permission/schema.ts` | `resourceType` 枚举扩展新增 `collection`（`PerResourceTypeEnum` 扩展） | 支持 collection 维度 clbs 存储（T-1 默认方案） |

**需要新增的表**:

| 表名 | 数据库 | Schema | 新增目的 |
| ---- | ------ | ------ | -------- |
| `dataset_upgrade_tasks` | MongoDB | 新增（任务记录集合） | 承载 F010 升级任务的异步执行记录（taskId/teamId/status/progress/failedRoots/createdAt），支撑长任务「202 + 进度查询 + 失败根续跑」（W-2 已冻结） |

**索引变更**:
- `resource_permissions` 现有 `{resourceType, teamId, resourceId, *}` 部分唯一索引可覆盖 collection 资源类型（新增枚举值复用既有索引结构），并支持检索链路「可读 collection 批量解析」按候选集合 `$in` 批量加载 clbs（F014/F011），无需新增索引。
- 若存量数据量大，建议为 `dataset_collections` 增加 `{datasetId, parentId}` 索引（已有 `{teamId, datasetId, parentId, updateTime}` 可复用），支撑检索/列表的 folder 递归展开。
- 检索过滤为纯读：可读集合解析不落库（仅查询时合成），无新增表；复用读从库 `readFromSecondary`（NFR-7）。

**存量数据兼容性**:
- `permissionVersion` CAS 比对时机（N4 冻结）：所有权限写路径（collaborator update / 继承状态变更 / move / 恢复继承 / changeOwner / F010 升级）在写入前读取目标资源 `permissionVersion`，写入时以该 version 为过滤条件做**读-比较-写（CAS）**，成功则 version+1；版本不一致返回 `inheritPermissionError`(507005) 并提示重试（R004 缓解落地，S-4 选型）。
- `resourceType` 新增枚举值采用增量扩展，旧数据可读（NFR-4）。
- 存量脏数据（move 残留、继承态非 folder 含 clb）由 F010 升级接口迁移。

### 3.2 配置文件变更分析

**需要修改的配置文件**:

| 配置文件路径 | 修改内容 | 修改目的 |
| ------------ | -------- | -------- |
| `pro` 前端（collection 协作设置弹窗） | 新增继承控制选择器、恢复继承、转移所有权入口 | 提供文件级权限配置 UI |

**如果不涉及修改**: 本需求不涉及后端服务配置文件变更（无新增环境变量；升级接口鉴权级别见 T-3，已冻结）。

---

## 4. 消息格式分析

**需要修改的消息格式**: 不涉及（无 Pulsar/消息队列变更；权限写操作均同步事务完成）。

**需要新增的消息格式**: 不涉及。

**说明**: 升级任务（F010）默认同步执行 + 幂等键；当单次执行超过 30s 预算时自动转异步任务，由新增任务记录集合 `dataset_upgrade_tasks` 承载（taskId/status/progress/failedRoots），经任务查询接口轮询进度、以 `rootDatasetId` 续跑失败根（W-2 已冻结）。不涉及消息队列消息格式变更。

---

## 5. 非功能需求详细说明

> **🚨 重要**: 非功能性需求只在本章描述，不应出现在第2章。

### 5.1 性能需求

| 指标类型 | 具体要求 | 测量方法 |
|---------|---------|---------|
| 列表响应时间 | `listV2` 在 10,000 collection、用户命中 2,000 条、pageSize=100 下 P95 ≤ 800ms；与改造前基线退化 ≤ 20% | 压测脚本统计 |
| N+1 规避 | 权限计算单请求内 clbs 批量加载（`$in`），per-collection 内存解析；禁止逐 collection 发起 DB 查询 | 代码审查 + 慢查询监控 |
| 批量传播 | 同步/取消继承/恢复继承使用 `bulkWrite` 批量写入，禁止逐条 await；单层子节点 ≥ 1,000 仍可完成 | 压测 + 日志统计 |
| 同步超时 | `syncChildrenPermission` / `resumeInheritPermission` 超时阈值 30s，超时任务失败回滚并记日志 | 监控告警 |
| 并发列表 | `listV2` 100 并发请求下 CPU 单核可接受，不触发超时（读从库 `readFromSecondary` 沿用） | 压力测试 |
| 递归去重 | 同步过程对同节点不重复遍历（visited 去重），避免环导致死循环 | 代码审查 + 环测试 |
| 检索过滤解析耗时（NFR-7） | 单 dataset 10,000 collection（用户可读 20%）下「可读 collection 批量解析」P95 ≤ 200ms，单请求 DB 查询次数为常数（批量 `$in`，禁止逐 collection 查询） | 压测脚本 |
| 检索端到端退化（NFR-7） | 检索叠加文件级过滤后端到端 P95 较改造前基线退化 ≤ 15%；全继承态 dataset 走短路路径（可读集合=全量候选，近似零额外开销） | 压测对比基线 |
| 检索高并发（NFR-7） | 检索单 API 100 QPS 下过滤解析不触发超时（沿用读从库 `readFromSecondary` / 复用召回既有批量取数通道） | 压力测试 |

### 5.2 安全性需求

| 安全维度 | 要求 |
|---------|------|
| 鉴权门槛 | 权限写接口（collaborator update、changeOwner、resumeInheritPermission、升级）100% 校验 manage/owner 门槛；read 用户负向用例全部返回 `unAuthDataset` |
| 信息不泄露 | 越权响应仅返回通用错误码（`unAuthDataset`），不包含资源名、其他用户信息、权限明细 |
| 自身保护 | 操作者不得通过配置接口移除/修改自身权限以提权或锁死（`canNotEditAdminPermission`） |
| 审计 | 关键写操作（配置、继承状态变更、move、恢复继承、changeOwner）写审计日志（`AuditEventEnum` 扩展），含操作者 tmbId、资源、变更前后权限摘要 |
| 传输/数据加密 | 沿用现有 HTTPS 与数据加密基线，无新增 |
| 检索静默过滤（NFR-8） | 无 read 权限 collection 内容在召回结果中不出现且不报错、不泄露「存在但无权」信息；越权负向用例下「无权限用户可召回」数为 0 |

### 5.3 可靠性需求

| 可靠性指标 | 目标 |
|-----------|------|
| 事务一致性 | 所有写路径（配置/继承状态变更/move/恢复继承/changeOwner/升级）100% 使用 mongo session 事务；异常回滚（注入中途失败，数据与操作前一致） |
| 幂等 | 重复执行同一配置/move/恢复继承请求结果幂等（第二次产生 0 变更） |
| 无残留 | move（继承新父级）后源目录特有 clb 残留数 = 0；恢复继承后非 owner clb 残留数 = 0（自动化校验脚本逐条比对） |
| 无泄漏 | 任意用户组合下「无权限用户可读/可写/可管理」的越权访问数 = 0（渗透/负向用例全通过） |
| 无冲突 | 冲突取消继承后独立配置完整保留（写入值与请求一致） |
| 升级重入 | 升级任务可重入，中断后可重跑且不产生重复/缺失权限 |
| 数据持久性 RTO/RPO | 依托 MongoDB 副本集：RPO ≤ 5 min（主从 oplog 同步），RTO ≤ 15 min（主从切换恢复 + 从库读降级）；权限数据无独立本地持久化（S-5 补充） |
| 检索越权召回（NFR-8） | 任意「用户 × collection 权限组合」负向用例下，无 read 权限 collection 在召回结果中出现次数 = 0（越权召回数 = 0） |
| 检索漏召回（NFR-8） | 对用户有 read 权限且 query 语义命中的 collection，漏召回数 = 0（正用例：结果包含全部可读命中，过滤不误删） |
| 检索权限即时生效（NFR-8） | 权限变更（配置 / 移动 / 恢复继承）后立即重发检索，召回集合与变更后权限一致（无陈旧缓存导致越权召回） |

### 5.4 可观测性需求

| 观测维度 | 要求 |
|---------|------|
| 日志 | 升级任务逐根日志（进度/失败根可定位）；同步/传播过程 debug 日志（`getLogger(LogCategories.MODULE.PERMISSION.INHERIT)`） |
| 审计 | 关键写操作审计日志（AuditEventEnum 扩展），含操作者、资源、变更前后权限摘要 |
| 监控 | `listV2` 权限计算耗时、批量同步耗时监控 |
| 告警 | 同步超时（30s）告警；事务失败告警 |

### 5.5 可维护性需求

- **代码规范**: 权限原语（继承解析、冲突判定、同步）抽取为共享模块（`packages/global/support/permission/utils.ts` / `packages/service/support/permission/`），禁止在 API 层重复实现。
- **文档要求**: 继承/独立状态转换矩阵（见 F001）作为权限模块权威文档维护。
- **测试覆盖**: 场景覆盖矩阵（2.4）对应测试用例全覆盖；检索回归用例集全量保留。

### 5.6 可扩展性需求

- **水平扩展**: 读多写少的权限解析可缓存/聚合（`listV2` 批量加载），无状态扩展不受限。
- **模块化**: collection 资源类型枚举增量扩展；统一校验抽象供 app/skill 等复用。
- **接口版本化（S-6 补充）**: 新增接口沿用现有 `/api/core` 与 `/api/proApi` 前缀体系；本次新增均为新端点或既有请求/响应**新增字段**（不改变既有字段语义），向后兼容；对既有 `authDatasetCollection`「透传 dataset 权限 → collection 维度解析」的行为变化，通过版本化发布 + 回归用例集控制。

---

## 6. 风险和依赖分析

### 6.1 技术风险

| 风险ID | 风险描述 | 影响功能 | 概率 | 影响 | 应对策略 |
|-------|---------|---------|------|------|---------|
| R001 | `resourceType` 新增 `collection` 枚举对全链路（含 proApi、admin、检索）影响面未完全评估（T-1） | F001,F002,F011,F012 | 中 | 高 | 设计阶段先行枚举扩展影响扫描；全链路回归 |
| R002 | 草稿 FR-2「非继承态子 folder 同步」表述与继承态不变量冲突（T-6） | F002,F008,F013 | 低 | 高 | **已冻结**：下发目标 = 仅 `inheritPermission=true` 子 folder（以 `syncChildrenPermission` 现有语义为准）；已删除草稿冲突措辞并补「非继承子 folder 不被覆盖」反例验收（W-1） |
| R003 | 继承/独立状态转换矩阵复杂，事务遗漏导致脏数据 | F001-F009,F013 | 中 | 高 | 全写路径统一 `mongoSessionRun` + 不变量完整性扫描（FR-14） |
| R004 | 升级接口与用户并发配置互相覆盖 | F010 | 中 | 中 | 幂等键必填 + 乐观并发控制（`permissionVersion` CAS）+ 低峰执行；单次 >30s 转异步任务并对同一资源路径写串行化（W-2） |
| R005 | 深树传播超时/死循环 | F006,F007 | 中 | 中 | BFS + visited 去重 + 30s 超时回滚 |
| R006 | `authDatasetCollection` 由透传 dataset 权限改为 collection 维度解析，影响其全部调用方（collection/read、detail、export、update 等）及检索链路（FR-11） | F011,F012,F014 | 中 | 高 | 新增独立「可读 collection 批量解析」函数仅检索链路使用，`authDatasetCollection` 语义变更以版本化发布 + 全量回归控制（T-7 默认方案） |
| R007 | 检索文件级过滤的挂载位置与召回计数/成本影响：pre-filter（召回前裁剪候选）vs post-filter（召回后过滤命中），涉及 embedding/fullText 召回计数、reRank token 成本、`limit` 截断（草稿 T-6 衔接策略，对应本规格 T-7） | F014 | 中 | 高 | 默认方案：召回前在 `collectionIds` 展开处预过滤；对 limit 截断与 reRank 成本设性能基线并压测（NFR-7）；pre/post 双路径回归兜底 |

### 6.2 性能风险

| 风险描述 | 触发条件 | 影响 | 应对策略 |
|---------|---------|------|---------|
| `listV2` 逐条权限查询 N+1 | 单 dataset 上万 collection | 列表超时、DB 压力 | clbs `$in` 批量加载 + 内存解析（NFR-1） |
| folder 全量下发逐条 await | 子 folder 1000+ | 写超时、事务过长 | `bulkWrite` + BFS（NFR-2） |
| 继承链递归深 | 10 层 dataset + 10 层 collection | 解析耗时 | visited 去重 + 缓存（NFR-1/NFR-2） |
| 升级任务长时运行 | 全量存量重算 | 阻塞用户写 | 低峰执行 + 逐根可重入 + 单次 >30s 自动转异步任务（W-2） |
| 检索过滤引入延迟退化 / 计数偏差 | 检索热路径逐 collection 解析或 pre/post 过滤挂载不当 | 检索延迟升高、embedding/fullText 计数与 reRank token 成本偏差 | 可读集合批量解析（`$in`）+ 缓存/短路（NFR-7）；召回前在 collectionIds 展开处预过滤 + 性能基线对比（R007/T-7） |

### 6.3 依赖关系图

```
[本系统]
  ├── 依赖 → [MongoDB resource_permissions](必需,影响:高 - clbs 存储)
  ├── 依赖 → [MongoDB dataset_collections](必需,影响:高 - collection 继承字段)
  └── 依赖 → [Team/MemberGroup/Org 服务](必需,影响:中 - group/org 权限叠加)

[被依赖情况]
  ├── [知识库检索/RAG] ← 依赖 collection 级「可读集合解析」（FR-11 文件级过滤，本需求实现）
  └── [前端知识库管理页] ← 依赖 collection 级权限配置接口
```

### 6.4 外部依赖详细说明

| 依赖项 | 类型 | 必需性 | 可用性要求 | 故障应对策略 |
|-------|------|-------|-----------|-------------|
| MongoDB | 存储 | 必需 | 99.9% | 事务回滚 + 从库读（`readFromSecondary`） |
| 团队/成员组/组织服务 | 内部服务 | 必需 | 99.9% | group/org 解析失败按无权限处理（fail-closed） |
| 审计日志 | 内部服务 | 可选 | 99% | 异步写入，失败不影响主流程 |

### 6.5 影响继承控制评估

**本需求实现后的影响**:
- ✅ 正向影响: 同一 dataset 下按文件控制访问继承控制；文件夹权限传播可控；move/恢复继承/changeOwner 后权限无残留、无泄漏；存量数据一键迁移到新语义。
- ⚠️ 需要注意: `authDatasetCollection` 从透传 dataset 权限改为 collection 维度解析，涉及所有 collection 读/写/列表接口及检索链路的鉴权行为变化，需对既有用户权限体验做回归（可能暴露此前「dataset 有权限即 collection 有权限」下被掩盖的无权限场景）；检索链路叠加文件级过滤后，原「有 dataset read 即召回全部」的用户其召回结果将按文件级权限裁剪，需在发布说明中向用户同步该行为变化。
- 📋 需要同步的团队: 前端知识库管理页（协作者配置 UI、继承控制选择、恢复继承、转移所有权入口）、运维（升级接口执行窗口）、QA（检索过滤越权/漏召回回归用例 + 权限负向用例）。

---

## 附录A: 待下游阶段确认的技术澄清问题

| 编号 | 问题 | 本规格默认方案 | 备注 |
|------|------|--------------|------|
| T-1 | collection 维度 clbs 存储方式：`resourceType` 新增 `collection` 枚举 vs 复用 `dataset` 类型以 collectionId 作 resourceId | 新增 `collection` 枚举（与 `getTmbPermission` 按 resourceType+resourceId 查询链路一致） | 需评估 proApi/admin/检索全链路影响 |
| T-3 | 升级接口（F010）暴露方式（内部运维命令 vs API）、鉴权级别、是否幂等键 | **已冻结**：HTTP API `POST /api/proApi/core/dataset/upgradePermission`；系统管理员或团队 owner 鉴权；`idempotencyKey` 必填；单次 >30s 自动转异步任务（新增 `dataset_upgrade_tasks` + 任务查询接口 + `rootDatasetId` 续跑） | 已冻结（对应 W-2） |
| T-4 | collection changeOwner 前端触发入口与传参；外链/OpenAPI 表在 collection 级是否需同步 | **已冻结**：入口为 collection 设置「转移所有权」（传 collectionId+ownerId）；collection 级**不同步**外链/OpenAPI 表——外链/OpenAPI 记录绑定 app（`OutLink.appId` 必填），collection 无独立外链资源形态；dataset 级沿用现有逻辑 | 已冻结（对应 W-4） |
| T-5 | 子资源缺少知识库 read 权限时是否自动补授 | 不实现（不自动扩权，避免权限扩散）；文件级授权不能绕过知识库权限门槛 | 已冻结
| T-6 | folder 配置时下发目标集合：草稿 FR-2「非继承态子 folder 同步」与继承态不变量冲突 | **已冻结**：仅同步 `inheritPermission=true` 子 folder（以 `syncChildrenPermission` 现有语义为准）；非继承子 folder 不被覆盖（已补反例验收）；草稿 FR-2 冲突措辞已删除 | 已冻结（对应 W-1 / R002） |
| T-7 | 检索文件级过滤与既有 dataset 级检索鉴权/召回路径的衔接（草稿 fr-nfr-draft.md 编号 T-6；本规格 T-6 已被 folder 下发目标集合占用并冻结，故编为 T-7）：`authDatasetCollection` 返回语义是否修改；过滤位置（召回前预过滤 vs 召回后过滤）；chat / searchTest / OpenAPI 是否统一函数；OpenAPI 过滤的 tmbId 语义 | 默认方案：新增独立「可读 collection 批量解析」函数仅检索链路使用（`authDatasetCollection` 不改变既有调用方语义，降低回归面）；召回前在 `collectionFilter` 的 collectionIds 展开处预过滤；chat / searchTest / OpenAPI 统一复用同一过滤函数（OpenAPI 按 apikey 关联 tmbId）；性能预算见 NFR-7 | 需评估 pre/post 过滤对 embedding/fullText 计数、reRank token 成本、`limit` 截断的影响（对应 R007） |

---

## 附录B: 通用错误码参照

| 错误码值 | statusText | 含义 |
|---------|-----------|------|
| 501002 | unExistDataset | dataset 不存在 |
| 501003 | unExistCollection | collection 不存在 |
| 501004 | unAuthDataset | 无权限 / 越权 |
| 501011 | canNotEditAdminPermission | 不能修改自身权限 |
| 507000 | invalidParams | 参数非法 |
| 507002 | fileNotFound | 文件不存在（HTTP 404） |
| 507004 | missingParams | 缺少参数 |
| 507005 | inheritPermissionError | 继承错误 |
| 507007 | folderMoveDepthLimit | 移动深度超限 / 成环 |
| 502002 | invalidOwner | 新所有者无效/跨团队（`AppErrEnum.invalidOwner`，S-1 已锁定数值） |
