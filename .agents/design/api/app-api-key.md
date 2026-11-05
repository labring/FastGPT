# 第三阶段：应用 API Key

> 状态：已实现并完成本地验收；首发版本 4.18.0。基于 `main@d09b4e8849`。
> 第一阶段已支持 customUid，第二阶段已支持 publishSource。本阶段恢复应用 Key，并明确它的应用边界和交接规则。
> 飞书入口：[应用密钥与调用用户身份 · 产品稿](https://fael3z0zfze.feishu.cn/docx/I3R9dZYv2o6JTYxVAwWcYuuonKf)。

## 产品方案

### 1. 两类 Key，各自管理

应用 Key 给业务后端使用；后端完成用户认证，再通过 `customUid` 传入业务用户 ID。

| 项目 | 应用 Key | 个人密钥 |
| --- | --- | --- |
| 绑定范围 | 一个确定的应用，创建后不可更换 | 当前成员的个人开放接口凭证 |
| 可用接口 | 绑定应用的对话、对话管理及配套文件接口 | 沿用成员在各开放接口上的权限 |
| 管理入口 | 应用 → 发布渠道 → API 调用 → 应用 Key | 账号设置；应用发布页的“个人密钥”Tab |
| 列表范围 | 当前应用的全部应用 Key | 当前登录成员自己的个人密钥 |
| 管理权限 | 仅当前应用管理员可查看、创建和管理；管理员之间可互相操作 | 沿用本人管理和团队创建限制 |
| 调用授权 | Key 本身授权绑定应用的对话与对话管理，不依赖归属成员的应用权限 | 按成员权限校验具体操作 |
| 归属成员 | 创建时为当前成员，交接时更新为接收人 | 本人，不随应用转交 |
| 代表团队成员执行 | 不支持 authProxy；支持 customUid | 沿用 authProxy，且与 customUid 互斥 |

**本期范围：只包括应用对话与对话管理。**

- 包括对话运行、停止/续传、历史列表及改名/删除、消息查询/删除、用户与管理反馈、对话日志查询/导出/统计，以及这些能力必需的对话文件和沙盒文件操作。
- 不包括应用创建/配置、工作流编辑、发布渠道/Key 管理、评测、知识库、模型管理、AgentSkill 和 Builder/Helper 对话。Key 的管理操作仍通过登录态完成。
- 应用 Key 本身授权上述范围内的对话、日志、删除和配套文件操作，不再检查归属成员的应用 ACL。仍检查接口是否接受应用 Key、绑定应用是否一致、目标会话/文件是否属于该应用。customUid 只标记使用者，不代替业务后端的用户授权。

### 2. 发布页与页面文案

```text
应用 / 发布渠道 / API 调用
┌──────────────────┬──────────────────┐
│ 应用 Key（默认）  │ 个人密钥          │
└──────────────────┴──────────────────┘
应用 Key / 个人密钥分段切换                 [新建应用 Key]

名称       Key          归属成员    最后使用    创建时间    操作
客服后端   ******a81f    张三        …           …          复制 / 编辑 / 删除
```

| 位置 | 文案 / 行为 |
| --- | --- |
| 应用 Key 用途（文档） | 仅可用于当前应用的对话与对话管理。成员离职后，由应用负责人接管。 |
| 个人密钥用途（文档） | 以你的成员身份调用开放接口，可访问范围取决于你的权限。 |
| 新建 / 编辑 | 名称；绑定应用只读；沿用现有版本支持的过期时间和积分上限 |
| 应用 Key 空态 | 暂无应用 Key，创建后可供业务后端接入当前应用。 |
| 无应用管理权限 | 仅应用管理员可查看、创建和管理应用 Key。个人密钥仍只展示本人数据。 |
| 删除确认 | 删除后，使用此 Key 的调用将立即失效。 |
| 调用文档 | 页面提供使用教程和 OpenAPI 文档入口；示例在文档区分两类 Key，页面不内嵌调用示例 |

列表继续脱敏，复制明文沿用现有复制接口及审计。搜索、时间排序、额度展示复用现有能力；Tab 切换独立加载列表与表单，不混入上一类 Key。个人标签继续仅作用于个人密钥；应用 Key 本期不增加标签体系，也不展示历史个人标签。

### 3. 调用规则

应用 Key 的调用示例：

```json
{
  "chatId": "业务会话 ID",
  "customUid": "customer-10001",
  "messages": [{ "role": "user", "content": "你好" }]
}
```

- 应用 Key 的 **绑定 appId 是权威值**。请求中的 appId 或 `Bearer key-appId` 后缀都不覆盖绑定；即使不同，也只执行 Key 绑定应用，不因 ID 不一致报错。
- 所有接受应用 Key 的对话、对话管理、日志和配套文件接口都允许省略 appId；鉴权统一读取 Key 绑定，返回固定的 `sourceType=app` 和 `sourceId=绑定 appId`，下游只使用该鉴权结果。语音和输入引导的旧 sourceType/sourceId 协议继续兼容。
- 个人密钥保持现有解析规则：completions 使用 `body.appId > key-appId 后缀`，其他应用接口使用个人密钥或登录态时仍显式传 appId。
- 两类 Key 的调用渠道都仍是“API调用”，渠道 ID 都是 OpenApi 记录的 `_id`；无需新增来源类型。渠道名、Tooltip、鉴权者/使用者沿用前两阶段规则。
- API 会话不增加“必须由同一 Key 续聊”的限制；有效应用 Key 可访问绑定应用的对话，个人密钥继续按成员权限访问。原有 MCP、分享链接来源校验不变。

### 4. 转交与失效

| 事件 | 处理 |
| --- | --- |
| 普通成员离职 / 被移出 / 开启资源转移的同步禁用 | 该成员持有的应用 Key 分别交给对应应用当前 owner |
| 应用 owner 离职 | 先转移其应用到团队 owner，再按新的应用 owner 转移该成员的 Key |
| 主动转移应用 owner | 随应用转移旧 owner 持有的应用 Key；其他成员持有的 Key 不变 |
| 个人成员离职 | 个人密钥不转移，随成员身份失效 |
| 应用删除 | 应用 Key 立即不可调用，随应用清理；不得解绑后变成个人密钥 |
| 接收人或应用异常 | 转交失败并回滚成员移出，不静默转给无关成员或扩大权限 |

同步资源转移开关关闭时，应用和 Key 均保留当前归属。

交接只更新 Key.tmbId，**Key 明文、记录 ID、累计用量、过期时间、额度均不变**，后端无需换 Key。tmbId 表示当前归属/鉴权成员，不新增 createdByTmbId；创建人与交接历史由审计保留。

历史 Chat.tmbId 不批量改写，外部使用者 ID 不拼接成员 ID；新会话使用新归属成员。旧会话续聊沿用 preChat 的现有身份处理。交接后的应用 Key 继续访问绑定应用的既有会话，不以新归属成员的应用 ACL 或 Chat.tmbId 限制历史范围；接收人通过网页登录时仍按本人的应用权限访问。

### 5. 历史 Key

| 现有记录 | 第三阶段归类 |
| --- | --- |
| 缺 type，存在合法且非空的 appId | 回填 type=app，原 appId 成为绑定边界 |
| 缺 type，appId 缺失、null 或空串 | 回填 type=personal |
| 已有合法 type | 保留；类型与绑定关系异常时报告错误 |
| 非空 appId 非法、未知 type | 拒绝使用并报告，不能兜底成个人密钥 |

不生成新 Key，不更换 `_id`，不删除任何历史字段。**带 appId 的历史 Key 将收紧为应用对话与对话管理凭证**；曾通过它访问其他应用、应用配置或知识库的接入，需改用个人密钥。上线说明必须单列这一行为变化。

## 技术方案

### 1. 数据模型：一个集合、一个分类字段

继续使用 `openapi` 集合，复用现有 appId（存储仍为 String）。新增公共 Zod 业务 Schema/枚举，由其推导类型；接口复用该定义。

```ts
type ApiKeyScope =
  | { type: 'personal'; appId?: never }
  | { type: 'app'; appId: string };

// 其他字段沿用：teamId、tmbId、apiKey、name、limit、usagePoints、tagIds……
```

- 新建显式写 type；应用类型要求有效 appId 且同团队、非删除、支持发布的应用，个人类型拒绝 appId。禁止给缺失 type 的旧记录直接套 personal 默认值。
- 新建绑定保存鉴权加载出的规范小写 ObjectId；历史大小写字符串按同一个应用匹配，保留原始字段，不拆分数量统计、交接或清理范围。
- type/appId 创建后不可变，不提供绑定修改、跨应用转移或个人/应用 Key 相互转换；更新接口独立定义可写字段，不能直接继承创建 Schema 的 partial 而允许改绑定。
- 统一 `resolveApiKeyScope` 供鉴权、列表、CRUD、health、交接与清理使用：先尊重显式 type，仅在 type 缺失时按历史 appId 推断。空值规则与回填一致；非法类型、非法绑定一律失败。
- 历史 appName 只作兼容展示；应用归属和权限以真实 appId 查询为准。历史 tagIds 保留，个人标签列表、计数、修改与清理仅处理 personal Key。
- 新建数量分别按“成员的个人 Key”和“应用的应用 Key”计算，复用现有数量上限配置；转交不算新建，不因接收人个人 Key 已满而失败。

### 2. 鉴权：默认拒绝应用 Key，只有对话入口显式放行

```text
解析真实 Key → 区分类型
  ├─ 个人密钥：authApiKey 放行 → 成员权限 → 执行
  └─ 应用 Key：authAppApiKey 放行 → Key/团队/应用有效性
                → 使用 Key 绑定 appId → 会话/文件归属一致 → 执行
```

`authOpenApiKey` 返回真实 `apiKeyId / apiKeyType / boundAppId / tmbId`，`boundAppId` 从数据库取得；凭证后缀仍只负责解析，不提供权限。类型、绑定关系、团队/应用可用性与现有商业版额度/有效期检查保持集中。

鉴权参数增加一个默认关闭的服务端开关，沿用现有命名风格：

```ts
authApiKey?: boolean;    // 接受个人密钥
authAppApiKey?: boolean; // 接受应用 Key，默认 false
```

这两个开关只由服务端接口声明，不接受客户端传入；两种 Key 都允许时同时设为 true。`authApiKey: true` 本身不再接受应用 Key；未开启 `authAppApiKey` 的接口默认拒绝应用 Key。

`parseHeaderCert` 确认 Key 类型被接口接受，并返回可信绑定信息；`authApp / authChatCompletionHeaderRequest` 在读取或返回业务数据前校验实际 appId。所有对话请求的 OpenAPI Schema 均以 union 声明“应用 API Key（无需 appId）”分支；该分支只放开请求形态，鉴权层仍要求真实应用 Key。应用 Key 忽略请求 appId 及 SDK 后缀，个人密钥保持原解析优先级。

应用 Key 的权限条件为：**凭证有效 ∧ 接口显式接受应用 Key ∧ 团队/应用可用 ∧ 使用绑定应用 ∧ 目标会话/文件属于该应用**。该分支跳过 `authAppByTmbId` 与成员的 `per` 检查；个人密钥和登录态仍走原成员权限链。

应用 Key 的 tmbId 只承担归属、审计、计费归因和日志鉴权者身份，不计算其调用权限。归属记录本身仍需合法，离职/禁用/注销由交接流程处理；不能把个人账号鉴权与应用 Key 的授权混在一起，使归属人的权限变更间接禁用 Key。

| 入口 | 实施要求 |
| --- | --- |
| v1/v2 completions 共用 authChatCompletionHeaderRequest | 开启 authAppApiKey；统一绑定检查；跳过成员应用 ACL；应用 Key 拒绝 authProxy；保留 customUid 及互斥规则 |
| authChatTargetCrud 与 history 服务 | 仅 sourceType=app 开启；应用 Key 使用团队+绑定应用范围，不按成员或 Key ID 筛会话；Skill/Builder/Helper 不放行 |
| 日志 list/getUsers、导出、Pro 统计 | 应用 Key 校验绑定应用后直接获得该应用的对话日志访问；个人密钥/登录态仍要求 AppReadChatLogPerVal；补齐当前仅登录态的导出支持 |
| 用户/管理反馈、批量删除与清空 | 应用 Key 在绑定应用内可执行；查询与更新必须带 teamId/appId；个人密钥/登录态保留原权限检查 |
| 对话文件、必要的沙盒文件接口 | 应用 Key 使用已授权会话的实际应用与 uid；不额外要求归属成员的应用写权限，S3 key/目标记录仍须属于绑定应用和对应会话 |
| 通用临时文件上传、知识库/模型等接口 | 不开启 authAppApiKey，应用 Key 默认拒绝；应用对话上传使用已绑定会话的上传接口 |
| health | 两种类型均返回自身 type/appId；校验共享的凭证有效性，不能只因记录存在就返回 valid |

`authApp` 仅在调用点显式开启 authAppApiKey 时进入应用 Key 分支；不能整体默认开放，否则同应用的配置/发布接口会被连带放开。不引入第二套 URL 路由名单或逐 Key 权限配置。

`authChatTargetCrud` 返回可信 Key 类型与对话访问范围供下游复用；不能伪造归属成员为应用 owner 或赋予其完整应用管理角色。原有依赖 permission.hasReadChatLogPer 的判断需要增加应用 Key 分支，不能跳过成员鉴权后又在下游按成员权限过滤。尤其检查二次 authCert、文件写入前的 authApp（如 chat/init、authSandboxSession）：复用结果或透传开关和绑定约束。

应用 Key 的 getHistories 固定只列绑定应用的 API 来源会话，不接受省略 appId 时的 source 筛选；显式 appId/source 也不能覆盖绑定及 API 来源。按会话 ID 的查询、改名和删除仍可管理该应用其他来源；批量删除按明确目标处理，clearHistories 仍只清 API 来源。所有操作使用团队+绑定应用范围，不按 Key.tmbId 或 publishSource.id 限制会话。个人密钥和外链保持原规则；历史文件使用会话保存的 uid，不因 Key 交接改用新成员 ID。

### 3. Key 管理 API 与 UI

沿用现有 `/api/support/openapi/*` 路由，不再新增一套应用 Key 管理服务。管理鉴权仅登录态；应用 Key 自身不能创建/复制/删除其他 Key。

应用 Key 的查看、创建、复制、编辑、删除统一检查绑定应用的管理权限。该应用的不同管理员可以查看并操作其他管理员创建的 Key，不按 Key.tmbId 过滤或限制；失去管理权限后，即使是 Key 创建人也不能管理或查看。拥有应用使用、编辑或日志查看权限不足以获得这些能力。

| 接口 | 契约调整 |
| --- | --- |
| POST create | 增加 type（缺省 personal，兼容现有调用方）；app 类型必填 appId，禁止 authProxy/tags；返回值仍是原始 Key 字符串 |
| GET list | 增加 type（缺省 personal）；app 类型必填 appId，按 teamId+appId 查全部应用 Key并检查应用管理权限；personal 只查本人 |
| PUT update | 只改名称、使用限制；个人类型保留标签/authProxy；应用类型拒绝这些字段以及任何 type/appId/tmbId 修改 |
| copy / delete | 先由记录的真实类型决定权限：personal 本人；app 绑定应用管理权限；不能信任请求自行声明类型 |
| list / health 出参 | 增加 type、appId；列表保留脱敏值，并返回 tmbId、sourceMember（名称/头像/状态）及 canCopy |

旧 list 的 appId 仅用于个人密钥列表置顶的行为退出；显式 type 决定列表。过渡旧客户端不传 type 时仍只取本人的 personal Key，不能因传了 appId 就扩大可见范围。

`Publish/API` 在列表标题区使用分段切换，`ApiKeyTable` 复用展示与编辑能力；账号页固定 personal。调用示例统一放入使用教程和 OpenAPI 文档，绑定 ID 不拼入存储值。应用 Key 不展示 authProxy 与个人标签控件。

创建、复制、修改、删除及交接均记录实际操作者、Key 记录 ID、类型、应用 ID；交接另记录 from/to tmbId。日志和审计中不写 Key 明文。所有新增/修改入参通过 `parseApiInput`，契约与 OpenAPI 描述同步，中英日韩页面文案走现有 i18n。

### 4. 转交和清理：复用事务与团队锁

应用 Key 的创建也共用团队锁；成员状态、应用管理权限复查、额度统计与插入都在锁内执行，防止成员交接后写入遗漏交接的新 Key。

1. `removeUserFromTeam` 沿用团队锁和 Mongo session；先完成离职成员的应用所有权转移。
2. 读取该成员剩余的应用 Key，按实际绑定应用当前 owner 分组；检查接收成员 active、同团队、具有应用所有权，再条件更新 tmbId。
3. 转交全部完成后才移除协作者权限、修改成员状态；任何有效应用的交接异常使本次事务回滚。重试用 `teamId + Key._id + 原 tmbId + 绑定 appId` 条件，避免覆盖并行修改。
4. 主动转移应用 owner 时，只处理本次**实际转移的应用 ID**中旧 owner 持有的应用 Key。不能使用 changeOwner 当前宽泛的 resourceList，把该成员在其他应用上的 Key 也交给同一人。

现有 Pro `changeOwner` 会按旧 tmbId 批量改 Key，成员移出时可能覆盖多个不同 owner 的应用，必须收敛。账户注销 `cleanupTeams` 当前在移出成员前删除其全部 Key，也必须改为先复用交接，再只清个人/无效残留；residualCheck 同步检查，不得误删已交接 Key。同步批量移出另有处理分支，也需接入应用 Key 交接；TRANSFER_RESOURCE_ON_MEMBER_LEAVE 关闭时不转移应用及其 Key，恢复成员不自动把 Key 归属改回去。

应用软删除后，鉴权立即因 deleteTime 拒绝。`deleteAppsImmediate / cleanupAppDirectRefs` 与最终删除均按类型清理绑定应用 Key，带 teamId/appId 条件并支持 session；删除整个应用/文件夹时覆盖其子应用。移除现有“unset appId 留作系统 Key”逻辑；孤立应用 Key 保持无效，不降级为个人密钥。团队整体删除继续清理团队全部 Key。

### 5. 自动回填与索引

追加新的独立自动迁移，任务 ID 为 `20261104_backfill_openapi_key_type`，首发版本 4.18.0，对应目录 `4180`；不修改前两阶段已经发布的任务。

- 仅给缺 type 的记录补 type；新建已显式写类型。按固定 `_id` 上界、稳定游标分批扫描，旧节点晚写记录由运行时推断兼容，不把迁移完成状态当成鉴权开关。
- 条件更新包含缺失 type 与原始 appId；被并行修改时重读后分类。已有类型不覆盖，已删除记录视为无需处理。
- 校验来源合法，不猜测已丢失的绑定；绑定应用已删除的 Key 保留 app 分类并拒绝调用。非法 ID、未知类型或类型/绑定冲突进入失败清单，修复后重试。
- 完整错误快照先于 checkpoint 保存，错误中仅记录 Key._id/原因，绝不保存 apiKey；成功条件为扫描范围全部完成分类且无未处理异常。统计扫描/个人/应用/异常数，不改明文、归属、额度或旧字段。
- 新代码统一兼容“缺 type + 历史 appId”，不等待迁移完成才能提供服务。全部鉴权节点升级后再对外开放新应用 Key；旧节点不识别应用范围，不能依赖回填阻止它放行。回滚必须使用理解 type/绑定边界的版本。

现有索引以 teamId/tmbId 为主，新应用列表不按 tmbId 过滤，新增候选索引 `{ teamId: 1, type: 1, appId: 1, _id: -1 }`，用真实查询 explain 验证后确定。appId 仍用现有 String，避免额外类型迁移。缺 type 的兼容分支保留 teamId/appId 过滤。

保留当前索引，实施时逐个核查用途，不仅因新增 type 就删除；个人标签、成员清理仍可能使用旧索引。所有定义使用 defineIndex；如确认废弃，登记精确 deprecated 定义并补索引管理清理验证。

### 6. 改造位置与验收

| 范围 | 主要落点 |
| --- | --- |
| 模型与共享类型 | global/support/openapi；service/support/openapi/{schema,auth}；global/openapi/support/openapi |
| 凭证与操作边界 | permission/{type,auth/common,auth/openapi,app/auth}；chat/auth；chatCompletion |
| 对话管理 | chat/history、record、feedback、file、sandbox；app/logs；Pro 图表 |
| 管理页面 | components/support/apikey/Table；Publish/API；账号密钥页；个人标签统计 |
| 生命周期 | Pro changeOwner、removeUserFromTeam、注销 cleanupTeams/residualCheck；App 删除服务 |
| 回填 | migration/registry 尾部追加；对应版本任务目录；四种语言迁移文案 |

验收按业务边界分组，不为每个 helper 重复生成同构测试：

| 组别 | 必须覆盖 |
| --- | --- |
| 类型与旧数据 | 两类新建；缺 type 的两种历史形态；非法/未知/冲突数据；新旧分类与列表一致 |
| 范围与身份 | 两种鉴权开关独立生效；v1/v2 同应用成功；省略 appId 的兼容；body/后缀冲突；显式其他应用 ID 仍执行绑定应用；同应用的配置/发布/知识库接口仍拒绝；customUid 与 authProxy 边界 |
| 管理权限 | 应用管理员管理其他成员的应用 Key；普通成员不可复制；个人 Key 始终仅本人；伪造类型/应用/成员字段无效 |
| 对话与文件 | 应用 Key 归属成员无应用/日志/写权限或其 ACL 被移除后仍可调用及管理对话；个人密钥仍受这些权限限制；覆盖续聊/停止/恢复、历史/日志/导出、反馈、批量删除/清空与文件读写；跨应用 chatId/S3 文件拒绝；无关 Skill/Builder 不放行 |
| 生命周期 | 离职者在多个不同 owner 应用下的 Key 分别交接；owner 离职/主动转移/同步禁用/注销；异常回滚；原 Key 与 ID/额度不变；旧历史可访问；应用与团队删除 |
| 回填 | 重放、断点、坏数据修复、CAS 冲突、并发创建/删除；旧字段和凭证不变；查询计划 |
| UI | 分段切换的列表/按钮/表单隔离，调用文档入口可用；无权限状态；复制审计；账号页只列个人；历史绑定 Key 出现在应用 Tab |

### 实施 TODO

- [x] 首发 4.18.0，固定迁移 ID/目录和对话入口范围。
- [x] 同步开关关闭不交接应用及 Key；clearHistories 保留仅 API 来源过滤。
- [x] 落地类型判定、默认拒绝及各对话入口声明；贯通绑定检查。
- [x] 扩展管理契约和两个 Tab，隔离个人标签与数量计算。
- [x] 完成离职/主动转交/注销/删除流程，验证事务和历史访问。
- [x] 追加回填任务，验证查询计划；同步调用示例、版本说明和业务测例。
- [x] 运行覆盖上述改动的最小充分单测、真实接口与 UI 验收；不主动执行全量测试。

### 业务验收用例

以下为第三阶段的 ready 用例定义；执行结果单独保存在临时验收报告中，ready 不代表通过。

- [Key 双 Tab 与管理权限](../../test/integration/openapi/FG-INTEGRATION-OPENAPI-002-app-key-management.md)
- [应用独立授权与绑定边界](../../test/permission/resource/FG-PERMISSION-RESOURCE-002-app-key-application-grant.md)
- [对话管理、日志与会话文件](../../test/chat/history-feedback/FG-CHAT-HISTORY-FEEDBACK-003-app-key-chat-management.md)
- [成员交接、转让与注销](../../test/permission/team/FG-PERMISSION-TEAM-001-app-key-handover-lifecycle.md)
- [历史类型回填与恢复](../../test/admin/maintenance/FG-ADMIN-MAINTENANCE-002-openapi-key-type-migration.md)
