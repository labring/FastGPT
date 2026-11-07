# 模型鉴权收敛设计

状态：已实施，待验收

## 背景

`authModels` 原先使用通用 `per` 位掩码同时表达使用、配置、授权和归属判断，返回 `string[] | undefined`。调用方普遍写成 `if (await authModels(...)) throw ...`，并在鉴权后重新调用 `getTeamModelHandle` / `findModelData`，存在以下问题：

- `Owner` 特判、`Write` 不含读位等隐含规则只能靠阅读位值理解；`Owner` 分支没有业务调用方。
- 抛错不统一：配置入口抛裸 `ModelErrEnum.unExist`，使用入口抛 `UserError(unAuthModel)`。
- `getTeamModelHandle` 每次包含两次 primary + linearizable 修订号读取，鉴权与调用方重复读取，且两次快照可能不同。
- 多数调用方只传 `{ teamId, tmbId }`，丢失 `isRoot` 且额外读取一次团队成员。
- 外链身份固定按非管理员计算，却与成员共用一条缓存，导致缓存抖动。
- 6 个模型配置路由各自拼装 `authUserPer → assertTeamModelEnabled → 鉴权 → 读模型 → 作用域校验`，顺序和判断依据不一致。

## 已确认的业务规则

1. root 与团队管理员不能使用或管理其他成员的团队模型（有意设计）。
2. 外链身份不读写成员模型缓存。
3. 配置入口按模型实际 scope 判断是否需要团队模型能力，并要求请求声明的 `channelType` 与模型实际 scope 一致。
4. 团队模型仅支持通过显式 `modelId` 引用与校验；任何旧 `model` 标识兼容解析（含运行时 `ModelHandle`、`formatModels`、跨环境导入导出、前端引用恢复）以及默认模型回退（含 `resolveEffectiveDefaultModelIds`、`formatModels` 默认物化、客户端 `getModelDefault`）均严格限定在系统模型（`isSystemModel`），绝不匹配或回退到团队模型。

## 鉴权动作

`ModelAuthAction` 取代通用权限位。三种动作按模型域规则独立判定，不做位掩码包含计算。

| action | 含义 | 系统模型 | 团队模型 |
| --- | --- | --- | --- |
| `use` | 在应用、知识库、辅助生成等业务中选择或调用模型 | root / 团队管理员；或模型未配置任何 ACL（默认开放）；或命中 ACL 授权 | 归属成员，或命中 ACL 授权 |
| `config` | 查看完整配置、测试、编辑、启停、删除、维护渠道绑定 | 仅 root | 归属成员且具备 `hasModelCreatePer` |
| `grant` | 查看和修改模型协作者 | root / 团队管理员 | 仅归属成员 |

外链身份只允许 `use`，且固定按非管理员计算；`config` / `grant` 一律拒绝。

## API

位置：`packages/service/support/permission/model/auth.ts`

```ts
type ModelActor =
  | { source?: 'member'; teamId; tmbId; isRoot: boolean; teamPermission?: Pick<TeamPermission, 'hasManagePer' | 'hasModelCreatePer'> }
  | { source: 'outLink'; teamId; tmbId };

authModels({ actor, modelIds, action, handle? }): Promise<string[]>
assertAuthModels({ actor, modelIds, action, handle? }): Promise<{ handle; models }>
getAuthorizedModelIds({ actor, handle, includeInactive? }): Promise<Set<string>>
```

- `isRoot` 必填，避免调用方遗漏 root 身份；`teamPermission` 可选，缺省时内部读取一次团队成员。字段名区别于 `authApp` / `authDataset` 返回的资源权限 `permission`，防止误传。
- `authModels` 只用于过滤场景（catalog、summary、协作者批量列表、应用资源鉴权），返回去重后保持输入顺序的无权限 ID，无则返回 `[]`。
- `assertAuthModels` 用于其余所有场景：任一模型无权限即抛 `UserError`，`config` 抛 `unExist`（不暴露模型是否存在），`use` / `grant` 抛 `unAuthModel`；返回同一快照的 `handle` 与已解析模型，调用方不再重复读取目录。
- `getAuthorizedModelIds` 默认只返回并缓存成员完整 active 可用集合，catalog 与 `authModels(use)` 复用它。摘要显式传入 `includeInactive: true`，返回包含停用模型的权限集合，不读写成员缓存，保持 `disabled` / `forbidden` 区分。
- 调用方已有 handle 时必须传入，保证鉴权和后续读取使用同一目录快照。
- 团队 handle 只包含系统模型和本团队模型，不再重复判断 `model.teamId === teamId`。

应用层位置：`projects/app/src/service/core/ai/model/auth.ts`

- `authModelViewer`：catalog / summary 的身份解析，外链返回 `source: 'outLink'` 身份。
- `authModelConfig({ req, modelIds, channelType })`：模型配置路由统一入口，执行 `authUserPer → assertAuthModels(config) → 校验 channelType 与模型 scope 一致 → 团队模型校验 assertTeamModelEnabled`，返回 `{ actor, handle, models }`。

### 间接鉴权路径

单模型的使用鉴权不再绕道应用资源流水线（`checkAppResourceReadPermissions → getUnauthorizedAppResources`）。该流水线会按 tmbId 反查成员、重新读取目录、丢失 `isRoot`、重复判断启用状态，并抛出原始字符串错误。

- `authTargetModelResource`（TTS、问题引导）：显式模型引用先通过 `handle.getModelData` 解析，传入 `modelId` 或 legacy `model` 都使用解析出的 `modelData.modelId` 执行资源鉴权，旧名称不享有免鉴权豁免。App 目标与知识库等资源走同一条快照链路——先查正式版本快照（正式对话、外链、API Key 共用）；未命中且 `authType=token`（唯一能进入 Test/Debug 的身份）时，复用 `resolveAppResourcesByPermission(blockOnUnauthorized)`：草稿快照基线内放行，相对草稿新增的模型按成员 `use` 阻断；外链 / API Key 未命中直接拒绝。非 App 目标（skillEdit、chatAgentHelper，仅登录成员可进入）走 `assertAuthModels(use)`。问题引导未配置模型时，通过 `getAuthorizedModelIds` 获取授权集合，再调用 `handle.getDefaultModelData('llm', { authorizedIds })` 选择可用系统默认模型；TTS 仍要求模型引用和 voice。调用方必须传入读取模型时的 `handle`，并通过 `modelHandle` 透传到 App 资源鉴权，避免重复读取目录。
- `authChatCrud` / `authChatTargetCrud` 返回 `isRoot`（外链固定 `false`），供上述调用方构造身份。
- `loadWorkflowModelResource`：所有工作流模型（LLM / Rerank）与 dataset、skill、tool、agent 统一收敛到具体使用节点内部按需加载与鉴权（不再放在调度器预执行阶段），也不再区分运行态静态/动态引用。规则：
  - 入参区分模型目录所属团队 `appTeamId`（取自 `runningAppInfo.teamId`）与运行人鉴权身份 `userInfo`（取自 `runningUserInfo` 的 `{ teamId, tmbId }`）：统一通过 `handle.getModelData(..., { type })` 解析模型定义，保留 `ModelConfigError` 语义；可选槽位传入 `fallbackToDefault: true` 时，仅对 `isModelConfigError` 在运行人有权限的系统模型内回退默认模型，无可用默认时返回 `undefined`，权限错误直接抛出；
  - `modelId` 与 legacy `model` 统一使用解析后的模型 ID，通过 `hasWorkflowResource({ context, type: 'model', id })` 核对当前工作流资源快照：命中快照按 `appTeamId` 目录直接放行；未命中快照（或无快照上下文）时统一回退到运行人 `userInfo`（`userInfo.teamId` / `userInfo.tmbId` 及对应团队 `ModelHandle`）执行 `assertAuthModels(use)` 校验（`isRoot` 取自工作流资源上下文）。旧名称只在系统模型内兼容解析，仍须通过同一套资源授权；
  - `prepareAppWorkflowResources`（Test/Debug 入口）在提取请求体资源与增量鉴权前，先用 `modelHandle.getActiveModels()` 执行 `formatModels(..., { modelReferencePolicy: 'preserve' })`，将调试请求体中的 legacy `model` 归一化为 `modelId`；已开启空槽位的默认 ID 由 `modelHandle.getDefaultModelIds(authorizedIds)` 提供，限定为当前操作人有权限的系统模型。显式引用仍从完整 active 目录解析，避免误拦 baseline 内已有授权模型；
  - 免登录外链的 `runningUserInfo` 为发布者，按成员身份计算（已确认可接受）；
  - 系统工具（commercial）内部使用 `createSystemToolResourceContext({ nodes, chatConfig })`：提取内部静态资源写入快照，省略 teamId 以允许读取系统工具声明的跨团队资源，并继承父级 root 标记；未命中快照的资源仍按运行人鉴权。个人工具仍切换到自身 Version 快照。
  - `dispatchWorkFlow` 的 `resourceContext` 改为必填，每个顶层运行都必须声明资源快照。Skill 调试把入口 `assertAuthModels(use)` 已授权的模型构造为快照传入，节点内命中快照直接放行，不再重复鉴权。
  - `createWorkflowResourceContext`（原 `loadWorkflowResourceContext`）为纯内存构造，改为同步；`runWithDerivedWorkflowFileContext` 不再支持传 `null` 清空快照（省略即继承父级）；移除运行态 `dynamic*` 参数与 `isWorkflowNodeResourceDynamic`。
- Agent v2 直接调用系统工具时，Invoke 令牌的 `teamId/tmbId` 取自 `runningUserInfo`，`appId` 仍取自 App source，确保用户信息反查当前运行成员而非应用 owner。
- Pro ChatAgentHelper：接口在 `preChatRound` 之前调用 `resolveChatAgentHelperModel` 完成模型选择（含默认回退）、`use` 鉴权与可用性检查，processor 只接收已授权的 `model` 对象，不再读取模型目录。
- `getUnauthorizedAppResources` 保留模型分支，用于应用保存、发布、调试时的混合资源批量过滤；其中停用模型返回 `unExist` 是既有行为，未改动。

## 缓存

- 成员 `use` 集合只包含 active 模型，继续缓存在 `TmpDataEnum.MemberModels`（存储值仍为 `my_models`）；命中条件为 catalogVersion 与 `hasManagePer` 一致。
- catalogVersion 已包含系统与团队修订号，模型写入后缓存自动失效，不需要主动清理；ACL、用户组、组织、成员变更仍调用 `clearMemberModelsCache` 清理团队缓存。
- 删除只写不读的 `version` 字段；`hasManagePer` 改为必填；清理函数只按 dataId 前缀匹配（dataId 固定为 `my_models--{teamId}--{tmbId}`）。
- 外链身份不读写缓存。

## TODO

- [x] 重写 `authModels`，新增 `assertAuthModels`、`getAuthorizedModelIds`，删除 `Owner` 分支与冗余团队判断
- [x] 缓存：重命名、删除 `version` 字段、外链跳过、清理函数简化
- [x] 新增 `authModelConfig`，迁移 detail / test / update / delete / updateStatus / updateChannels
- [x] 迁移 catalog / summary / 协作者 list / batchList / update
- [x] 迁移 dataset create / createWithFiles（抽取模型选择校验）/ update / searchTest / rebuildEmbedding
- [x] 迁移 optimizePrompt / optimizeCode / debugChat / evaluation / chatAgentHelper / 应用资源鉴权
- [x] summary 仅吞已知无权限错误
- [x] 修正 ModelConfigTable 过期注释，同步 client-model-catalog 与 model-id-reference-migration 文档
- [x] 更新受影响测试并运行局部测试（update.test 直接写库的模型补齐目录修订号；集成测试兼容 UserError）
- [x] 收敛间接路径：`authTargetModelResource` 非 App 分支与工作流模型运行态鉴权改用 `assertAuthModels`；chat 鉴权返回 `isRoot`
- [x] 统一五类工作流资源（`model` / `dataset` / `skill` / `tool` / `agent`）运行态鉴权：移回节点内通过 `loadWorkflowModelResource` 执行，移除运行态动静态区分，统一按「命中 `resourceContext` 走快照、未命中回退运行人权限」处理
- [x] 系统工具运行提取内部静态资源写入 `trusted` 上下文，静态资源免鉴权、未命中资源仍按运行人鉴权；补单测
- [x] Skill 调试传入已授权模型快照，消除重复鉴权；`dispatchWorkFlow.resourceContext` 必填，清理 `null` 清空语义与 `useResourceSnapshot`
- [x] Pro ChatAgentHelper 模型解析与鉴权前移到 `preChatRound` 之前，processor 只消费模型对象
