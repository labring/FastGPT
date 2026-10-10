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
getAuthorizedModelIds({ actor, handle }): Promise<Set<string>>
```

- `isRoot` 必填，避免调用方遗漏 root 身份；`teamPermission` 可选，缺省时内部读取一次团队成员。字段名区别于 `authApp` / `authDataset` 返回的资源权限 `permission`，防止误传。
- `authModels` 只用于过滤场景（catalog、summary、协作者批量列表、应用资源鉴权），返回去重后保持输入顺序的无权限 ID，无则返回 `[]`。
- `assertAuthModels` 用于其余所有场景：任一模型无权限即抛 `UserError`，`config` 抛 `unExist`（不暴露模型是否存在），`use` / `grant` 抛 `unAuthModel`；返回同一快照的 `handle` 与已解析模型，调用方不再重复读取目录。
- `getAuthorizedModelIds` 返回成员完整可用集合，catalog 直接用它过滤，`authModels` 的 `use` 分支复用它。
- 调用方已有 handle 时必须传入，保证鉴权和后续读取使用同一目录快照。
- 团队 handle 只包含系统模型和本团队模型，不再重复判断 `model.teamId === teamId`。

应用层位置：`projects/app/src/service/core/ai/model/auth.ts`

- `authModelViewer`：catalog / summary 的身份解析，外链返回 `source: 'outLink'` 身份。
- `authModelConfig({ req, modelIds, channelType })`：模型配置路由统一入口，执行 `authUserPer → assertAuthModels(config) → 校验 channelType 与模型 scope 一致 → 团队模型校验 assertTeamModelEnabled`，返回 `{ actor, handle, models }`。

### 间接鉴权路径

单模型的使用鉴权不再绕道应用资源流水线（`checkAppResourceReadPermissions → getUnauthorizedAppResources`）。该流水线会按 tmbId 反查成员、重新读取目录、丢失 `isRoot`、重复判断启用状态，并抛出原始字符串错误。

- `authTargetModelResource`（TTS、问题引导）：App 目标仍只认正式版本资源快照；非 App 目标（skillEdit、chatAgentHelper，仅登录成员可进入）改为 `assertAuthModels(use)`，必须传入 `teamId`、`isRoot` 和调用方读取模型时的 `handle`。两个分支统一抛 `UserError(unAuthModel)`。
- `authChatCrud` / `authChatTargetCrud` 返回 `isRoot`（外链固定 `false`），供上述调用方构造身份。
- `assertWorkflowNodeModelResources`：在节点调度的 `try` 内、节点本体执行前调用，失败按节点错误处理（支持 `catchError`），不会中断整个工作流。规则：
  - 静态模型只核对资源快照（纯内存），不做权限校验；
  - 动态引用按运行人 `assertAuthModels(use)` 校验，`teamId/tmbId` 取自 `runningUserInfo`，`isRoot` 取自工作流资源上下文；
  - 免登录外链的 `runningUserInfo` 为发布者，按成员身份计算（已确认可接受）；
  - 系统工具（commercial）内部使用 `createSystemToolResourceContext()`（`trusted`）：静态模型、知识库、应用、Skill、工具集子工具直接使用，不做声明校验与用户态鉴权；动态引用仍按运行人鉴权。个人工具仍切换到自身 Version 快照。
- `getUnauthorizedAppResources` 保留模型分支，用于应用保存、发布、调试时的混合资源批量过滤；其中停用模型返回 `unExist` 是既有行为，未改动。

## 缓存

- 成员 `use` 集合继续缓存在 `TmpDataEnum.MemberModels`（存储值仍为 `my_models`，兼容已有记录）；命中条件为 catalogVersion 与 `hasManagePer` 一致。
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
- [x] 收敛间接路径：`authTargetModelResource` 非 App 分支、`assertWorkflowNodeModelResources` 动态引用改用 `assertAuthModels`；chat 鉴权返回 `isRoot`
- [x] 恢复工作流节点模型校验：放入节点 `try`，失败转为节点错误；补调度测试
- [x] 系统工具运行改用 `trusted` 上下文，静态资源免鉴权、动态引用仍鉴权；补单测
