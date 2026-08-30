# 模型引用统一为 modelId 设计

状态：modelId 迁移已实现；客户端模型目录后续重构待实现

最后核对：2026-08-30

后续客户端模型目录、接口收敛、本地缓存和 version 设计以
[客户端模型目录与接口收敛设计](./client-model-catalog.md) 为准。本文中关于分页
`getMyModels`、单模型 `getMyModel`、`getInitData.defaultModels/modelProviders` 和选择器自行请求
的内容仅记录 modelId 迁移落地时的历史实现，不再代表下一阶段目标架构。

## 1. 背景

当前系统同时把 `model` 用作三种不同语义：

1. 模型配置的查找键，例如 `gpt-4o`。
2. Dataset、Workflow、Evaluation 等业务数据中保存的模型引用。
3. 发给 OpenAI 兼容接口和 AIProxy 的 provider model 名称。

这三种语义混用后，模型展示名、provider model 名、平台内模型配置无法稳定区分；同时，现有缓存同时用 `model` 和 `name` 建索引，显式传入一个不存在的模型时还可能静默回退到默认模型。

本轮只解决“平台内模型引用统一为 `modelId`”。渠道、私有模型管理、管理员统计等能力从原 PR 中拆出，不在本轮实现。

## 2. 已确认前提

- 历史 `system_models` 数据全部视为系统模型；升级后该表只读保留，运行时统一使用 `ai_models`。
- 历史业务引用保存的是系统模型 `model`，不是私有模型引用。
- 新保存的业务配置只保存 `modelId`。
- 新 Usage 只保存 `modelId`；历史 Usage 的 `model` 不迁移、不转换展示名，查询时原样展示。
- 后端在过渡期仍兼容按旧 `model` 查找，但旧值只能命中系统模型。
- 私有模型只能传 `modelId`；本轮不实现私有模型 CRUD、所有权和渠道。
- 当前 modelId 迁移版本使用分页接口按需获取模型；下一阶段将改为完整、版本化的成员模型目录和 `useModelStore` 本地缓存。
- 下一阶段 `getInitData` 将删除模型、Provider 和默认模型，模型域使用独立 version。
- 新版本仅在 `ai_models` 为空时后台读取旧表，全量校验后单事务一次性写入；4.16.3 单独回填资源引用。

## 3. 目标与非目标

### 3.1 目标

- 以 `ai_models._id` 作为平台内唯一、稳定的模型身份；首次迁移保留旧 `_id`。
- 所有“选择/引用某个模型”的新业务数据改存 `modelId`。
- 所有内部模型调用链先用 `modelId` 解析配置，再在 provider 边界使用 `modelData.model`。
- 只有公开 System OpenAPI 兼容接收 `modelId/model`，只在公开 API 边界解析一次；非公开接口（包括 Dev-only OpenAPI）和内部临时配置只接收 `modelId`，进入实际模型请求链后只传 `modelData`。
- 旧数据、旧请求中的系统模型 `model` 在兼容窗口内仍可读取。
- 提供可审计、可重复执行、不会把脏值写入 `*ModelId` 的迁移工具。
- modelId 迁移阶段保持现有客户端行为；下一阶段按关联设计收敛为当前成员完整模型目录。

### 3.2 非目标

- 不引入私有模型、`tmbId/teamId` 所有权、创建者、成员组授权等新业务。
- 不引入或改造 Channel，不让 AIProxy 在本轮按 `modelId` 路由。
- 不实现 root/成员维度的模型日志、统计和渠道消耗分组。
- 以 upstream main 已完成移动后的管理员模型页面为基线，只在新位置修改 modelId 相关的数据读取、表单和选择器；不恢复旧页面、不复制旧组件，也不重复提交页面迁移改动。
- 新增 `ai_models` 作为权威模型实例表，并新增 `ai_default_models` 保存作用域默认模型；旧 `system_models` 仅作回滚快照。
- 不删除历史兼容字段；删除动作放到后续 contract cleanup 版本。
- 不做与 modelId 无关的 OpenAPI、价格、权限框架或目录重构。

## 4. 术语与不可破坏的约束

| 名称       | 含义                               | 是否可作为业务外键                                           |
| ---------- | ---------------------------------- | ------------------------------------------------------------ |
| `_id`      | MongoDB 中 `ai_models` 文档主键    | 仅数据库内部使用                                             |
| `modelId`  | `_id.toString()`，平台模型唯一身份 | 是，唯一 canonical 引用                                      |
| `model`    | provider 侧路由名称，例如 `gpt-4o` | 否；仅兼容旧引用和 provider 请求                             |
| `name`     | 用户可见展示名                     | 否                                                           |
| `scope`    | 模型实例作用域                     | 本轮固定为 `system`，后续可扩展 `team`                       |
| `isCustom` | 是否不在插件模板中                 | 运行时根据模板匹配结果派生，不能表示所有权，不能参与身份判断 |

核心约束：

1. `modelId` 一旦生成，不因模型改名、配置更新、插件重载而变化。
2. 静态 `modelId` 只允许写入非空稳定 ID 字符串，不能写入未解析的 `model/name`；Workflow 引用类型或模板表达式允许原样保存在 `modelId` input 中，由运行时解析为实际 modelId。
3. 显式传入无效模型时必须报不存在或不可用，不能回退默认模型。
4. 只有参数确实缺省、且业务定义允许默认值时，才显式调用默认模型 getter。
5. provider 请求仍发送 `modelData.model`；不能把 Mongo ObjectId 直接发给 OpenAI 兼容接口。
6. 模型解析只发生一次；完成解析后的内部 request 函数只接收具体 `modelData`，不再接收 modelId、model 或二者的联合字符串。

## 5. `ai_models` 数据模型

### 5.1 扁平管理字段 + 类型化 `config`

移除 `metadata` 这个无边界的万能容器。模型身份、管理、路由和计费放在顶层；不同模型类型的调用能力和参数集中放入一个有明确 Schema 的 `config` 对象。默认模型是“用途到模型 ID”的作用域配置，独立保存在 `ai_default_models`：

```ts
type SystemModelDocument = {
  _id: ObjectId;

  model: string;
  type: ModelTypeEnum;
  provider: string;
  name: string;
  scope: ModelScopeEnum.system;
  isActive: boolean;
  testMode?: boolean;

  requestUrl?: string;
  requestAuth?: string;

  charsPointsPrice?: number;
  priceTiers?: ModelPriceTier[];
  inputPrice?: number;
  outputPrice?: number;

  config: ModelConfig;
};

type RuntimeSystemModel = Omit<SystemModelDocument, '_id'> & {
  modelId: string;
  avatar?: string;
  isCustom?: boolean;
};
```

字段归属遵循以下规则：

- 顶层字段回答“这是谁、由谁提供、是否启用、如何连接、如何计费”。
- `config` 回答“这个类型的模型支持什么，以及调用时如何构造参数”。
- `modelId`、`avatar`、`isCustom` 是派生字段，不在 MongoDB 中重复保存。
- `metadata` 只作为迁移期 legacy 字段保留，新写入不再产生 `metadata`。

不在 MongoDB 中重复保存 `modelId`；运行时和 API 返回时由 `_id` 映射得到。这样只有一个真实主键来源，避免 `_id` 与 `modelId` 不一致。

### 5.2 `config` 类型设计

`config` 不是新的 `metadata`。它必须根据顶层 `type` 使用 discriminated union 校验，禁止任意字段穿透：

```ts
type LLMModelConfig = {
  maxContext: number;
  maxResponse: number;
  quoteMaxToken: number;
  maxTemperature?: number;

  showTopP?: boolean;
  responseFormatList?: string[];
  showStopSign?: boolean;

  censor?: boolean;
  vision?: boolean;
  audio?: boolean;
  video?: boolean;
  reasoning?: boolean;
  reasoningEffort?: boolean;
  functionCall?: boolean;
  toolChoice?: boolean;

  defaultSystemChatPrompt?: string;
  defaultConfig?: Record<string, unknown>;
  fieldMap?: Record<string, string>;
};

type EmbeddingModelConfig = {
  defaultToken: number;
  maxToken: number;
  weight: number;
  hidden?: boolean;
  vision?: boolean;
  normalization?: boolean;
  batchSize?: number;
  defaultConfig?: Record<string, unknown>;
  dbConfig?: Record<string, unknown>;
  queryConfig?: Record<string, unknown>;
};

type RerankModelConfig = {
  maxToken?: number;
  defaultConfig?: Record<string, unknown>;
};

type TTSModelConfig = {
  voices: Array<{ label: string; value: string }>;
};

type STTModelConfig = Record<string, never>;
```

Zod canonical schema 建议按外层 `type` 组成 discriminated union：

```ts
const LLMModelSchema = BaseModelSchema.extend({
  type: z.literal(ModelTypeEnum.llm),
  config: LLMModelConfigSchema
});
```

Mongoose 顶层字段应显式声明，`config` 可以使用 `Schema.Types.Mixed`，但所有 create/update/upsert 必须先经过对应 Zod schema。迁移窗口内额外声明可选的 deprecated `metadata: Schema.Types.Mixed` 供旧数据读取；新写入 DTO 必须主动剔除它。无需再用 `strict: false` 接收未知顶层字段。

默认标记不放进 `config`：它表示系统选择了哪个模型，不是 LLM 本身的调用能力。价格和连接信息也不放进 `config`，因为它们跨模型类型共享，且未来可能分别迁移到计费或 Channel 领域。

### 5.3 数据库、运行时与客户端形态

数据库和服务端 canonical runtime 都保留 `config` 边界，业务代码相应使用 `modelData.config.maxContext`、`modelData.config.vision`。这样不会在加载后再次把 `config` 摊平，避免形成第二套结构。

插件 SDK 1.1.0 的模型协议仍是扁平结构。各类型共同提供：

- 身份/展示字段：`type`、`provider`、`model`、`name`。
- 初始价格字段：`charsPointsPrice`、`inputPrice`、`outputPrice`。
- LLM 能力字段：`maxContext`、`maxTokens`、`quoteMaxToken`、温度/返回格式/多模态/推理/工具调用能力、`defaultSystemChatPrompt`、`defaultConfig`、`fieldMap` 等。
- Embedding 能力字段：`defaultToken`、`maxToken`、`weight`、`hidden`、`normalization`、`defaultConfig`、`dbConfig`、`queryConfig`。
- Rerank 能力字段：`maxToken`；TTS 能力字段：`voices`；STT 没有额外能力字段。

插件协议不提供 `scope`、`isActive`、`testMode`、默认模型标记、`requestUrl`、`requestAuth` 和 `priceTiers`。其中 `scope` 在本轮固定写为 `system`，其余均为 FastGPT 数据库业务字段。

插件数据进入系统时，只允许由一个 normalize 函数完成以下转换，数据库、API 和缓存不得各自实现字段分拣：

1. `maxTokens` 映射为 `config.maxResponse`，其余类型能力字段放入对应 `config`。
2. `type/provider/model/name` 保留为顶层初始化字段。
3. 插件的旧价格字段保留为顶层初始化价格，不放入 `config`。
4. 插件中的 deprecated 场景开关只用于旧数据兼容，不进入新的 canonical schema。

模型加载阶段不得再使用 `{ ...pluginModel, ...dbModel }` 合并整个对象。数据库文档是可独立运行的完整实例和唯一权威来源；插件模板只在首次物化时提供身份、展示、价格和 `config` 初始值：

| 字段                                    | 首次物化来源               | 后续加载/同步规则                               |
| --------------------------------------- | -------------------------- | ----------------------------------------------- |
| `_id/modelId`                           | MongoDB                    | 永不被插件改变                                  |
| `model/type`                            | 插件模板初始化             | DB 权威；与插件不一致时记录配置错误，不静默覆盖 |
| `provider/name`                         | 插件模板初始化             | DB 权威，允许管理员调整；插件更新不覆盖         |
| `scope`                                 | FastGPT 固定写入 `system`  | 本轮不可由管理员修改，插件不参与                |
| `isActive/testMode`、默认标记、连接信息 | FastGPT 默认值或管理员配置 | 只读 DB，插件不参与                             |
| 价格字段                                | 插件模板初始化             | DB 权威，插件更新不覆盖管理员价格               |
| `config`                                | 插件能力配置初始化         | 只读 DB 完整快照；模板变化不隐式合并            |
| `avatar/isCustom`                       | 不持久化                   | 分别由 provider 和是否命中插件模板派生          |

加载时不做 `config` 合并。`defaultConfig`、`fieldMap`、`dbConfig`、`queryConfig`、数组以及 `false`、`0` 等值全部按数据库快照解释；配置不完整或非法时保留上一版运行时缓存并暴露配置错误，不能从插件或其他模型借默认值。

客户端也接收 `config`，但必须返回脱敏子集，例如最大 token、vision、audio、reasoning、toolChoice 和 voices；`defaultSystemChatPrompt`、`defaultConfig`、`fieldMap`、`dbConfig`、`queryConfig` 不返回普通客户端。

### 5.4 系统模型物化

当前插件返回的模型可能没有对应的数据库文档。如果只给现有 DB 文档增加 `modelId`，未被管理员改过的插件模型仍然没有稳定 ID，因此必须先物化：

1. 启动或显式同步时读取插件模型模板和 `ai_models`。
2. 对每个插件模型按 `{ scope: system, model }` 执行幂等 upsert；旧表接管由独立启动迁移完成，自动预装不读取 `system_models`。
3. 已存在的文档保留 `_id` 和全部数据库配置；自动预装只使用 `$setOnInsert`，不通过插件模板补齐或覆盖存量 `config`。
4. 新插件模型第一次同步时创建文档，此后始终复用该 `_id`。
5. 多实例并发依靠唯一索引收敛；重复键后重新读取，不生成第二个 ID。
6. 插件列表是 repair、物化和 active 列表计算的输入，获取失败时必须 fail-fast：启动阶段直接阻止实例启动；运行时重载阶段返回失败并保留上一版全局 active 模型对象和列表。失败路径不得执行 repair、删除、物化或可用模型缓存清理，因此不会删除模型或改变已有 ID。

物化完成后，插件模型只承担“默认模板”职责，数据库文档承担“稳定身份和实际配置”职责。插件新增或删除默认能力不会直接重写管理员配置；未来若需要把新模板字段升级到存量实例，必须通过显式升级动作持久化，不能在运行时加载中隐式补齐。

### 5.5 唯一索引

当前全局唯一 `{ model: 1 }` 需要替换为仅约束系统模型的部分唯一索引：

```ts
defineIndex(SystemModelSchema, {
  key: { scope: 1, model: 1 },
  options: {
    name: 'uniq_system_model',
    unique: true,
    partialFilterExpression: { scope: ModelScopeEnum.system }
  }
});
```

旧 `{ model: 1 }` 索引属于只读 `system_models`，不得由新 Schema 注册或清理；`ai_models`
从第一版开始只声明当前索引。这样旧表的结构和索引都不会被新版本隐式修改。

未来团队安装 PR 再增加部分唯一索引 `{ scope: 1, teamId: 1, model: 1 }`，过滤 `scope=team` 且 `teamId` 存在。本轮不提前引入 `teamId` 和团队模型逻辑。

不能只建立无 partial filter 的 `{ scope, model }` 唯一索引，否则所有团队模型仍会在全平台共享一组唯一空间，与未来的“团队内唯一”冲突。

### 5.6 `scope` 与 `isCustom`

- 本轮 `ai_models` 中的所有模型都属于平台系统模型，包括管理员自行添加、未命中插件模板的模型；创建和迁移统一写入 `scope: system`。
- 本轮输入 Schema 将 `scope` 收紧为 literal `system`，不允许管理员 API 写入团队作用域。未来团队安装需求再扩展这一边界。
- `isCustom = true` 的唯一含义是“该系统模型不在当前插件模板列表中”；命中模板则为 `false`。它不表示私有模型、创建者或所有权。
- `isCustom` 只在运行时根据 `model` 是否命中插件模板派生，不持久化，也不得用于访问控制或唯一索引；命中后若 `type` 不一致，应作为模板/数据库配置错误单独报告，不能把它伪装成自定义模型。

## 6. 模型加载、缓存与查找

### 6.1 缓存结构

canonical 模型缓存只建立一个统一 Map：

```text
systemModelMap
systemModelList
systemActiveModelList
```

`systemModelMap` 使用带命名空间的 key，把同一个 canonical `modelData` 引用注册为多个查找入口：

```text
id:<modelId>             -> modelData
model:<model>            -> modelData
```

不得直接使用裸字符串作为 key，否则一个模型的 `model` 可能与另一个模型的 `modelId` 碰撞。`modelId` 和系统模型 `model` 分别具有唯一约束。展示字段 `name` 不属于模型身份，不建立索引，也不参与任何兼容查找。

`modelId` 在全部模型类型中全局唯一，因此不再分别维护 LLM、Embedding、Rerank、TTS、STT 的 Map。虽然同一对象在统一 Map 中有多个索引 key，但 value 指向同一个对象，不形成多份模型状态。整个 Map 在 reload 完成后一次性替换，不能局部更新某个索引。

按类型列举模型时，从 `systemModelList` 或 `systemActiveModelList` 过滤/分组；只有出现可验证的性能瓶颈后，才考虑增加由主列表一次性派生的只读分组结构，不能再引入多个可独立更新的权威 Map。

兼容期结束后，可以删除 `model:` 索引，只保留 `id:` 索引；该清理不影响 canonical 模型对象结构。

### 6.2 Model reference 输入协议

本节的“公开 OpenAPI”特指 `/apidoc/systemopenapi` 中支持 API Key 鉴权的对外接口。代码上以 operation 是否显式标记 `SystemOpenApiTagMap` 为唯一边界；`packages/global/openapi` 中只标记 `DevApiTagsMap` 的站内开发者接口不属于公开 API，可以只接收 `modelId`。不得仅根据“是否定义了 OpenAPI schema”判断是否需要保留外部兼容。

所有已经对外发布、且允许调用方选择平台模型的公开 OpenAPI，在兼容期统一接收：

```ts
const ModelReferenceSchema = z
  .object({
    modelId: z.string().optional(),
    model: z.string().min(1).optional().meta({
      deprecated: true,
      description: '旧版系统模型 provider model 标识'
    })
  })
  .refine(({ modelId, model }) => modelId || model, {
    message: 'modelId or model is required'
  });
```

解析规则：

1. 只要传入 `modelId`，就只按 modelId 查找；同时传入的 deprecated `model` 不参与解析，也不做一致性校验。
2. `modelId` 找不到时立即返回“模型不存在”，不能降级使用同时传入的 `model`。
3. 没有传 `modelId`、但传了 `model` 时，才进入 deprecated 兼容分支，并且只能按精确的 `model:<value>` 解析系统模型；不按展示字段 `name` 回退，找不到同样返回“模型不存在”。
4. 两者都没有时，如果该业务字段必填则返回参数错误；如果业务明确允许默认模型，由调用方显式取得默认 `modelData`。
5. OpenAI 兼容 `/v1`、`/v2` 协议中的标准 `model` 不标记废弃，仍按外部协议处理。

所有已有公开 OpenAPI schema 直接增加 `modelId`，旧 `model` 使用 `.meta({ deprecated: true })`；不复制一套平行 API。非公开 OpenAPI（包括只出现在 Dev API 文档的站内接口）、内部 RPC 参数和临时 metadata 不承担对外协议兼容，只声明并接收 `modelId`。

当前 System OpenAPI 中会让调用方选择平台模型的请求字段如下：

| 公开接口                        | canonical 字段                  | deprecated 字段               | 缺省语义                            |
| ------------------------------- | ------------------------------- | ----------------------------- | ----------------------------------- |
| `POST /core/dataset/create`     | `vectorModelId`                 | `vectorModel`                 | 两者都缺少时使用默认 Embedding 模型 |
| `POST /core/dataset/create`     | `agentModelId`                  | `agentModel`                  | 两者都缺少时使用默认 LLM            |
| `POST /core/dataset/create`     | `vlmModelId`                    | `vlmModel`                    | 两者都缺少时使用默认 VLM            |
| `POST /core/dataset/searchTest` | `rerankModelId`                 | `rerankModel`                 | 仅启用 Rerank 时解析                |
| `POST /core/dataset/searchTest` | `datasetSearchExtensionModelId` | `datasetSearchExtensionModel` | 仅启用问题扩展时解析                |
| `POST /core/dataset/searchTest` | `datasetDeepSearchModelId`      | `datasetDeepSearchModel`      | 仅启用深度搜索时解析                |

表内每组字段都必须把 `modelId` 和 deprecated `model` 一起传给统一的 `getXXModelData`，不得在 API handler 中先用 `modelId ?? model` 压成单个字符串。这样才能区分“没有传 `modelId`”与“传入的 `modelId` 无效”，并保证后者立即报“模型不存在”而不回退。

OpenAI 兼容对话响应中的 `model` 是外部协议字段，不是 FastGPT 平台模型引用，不在上述字段矩阵内，也不标记 deprecated。

### 6.3 `getXXModelData` 规则

类型化获取函数统一接收两个明确字段，而不是接收语义含糊的单个字符串：

```ts
getLLMModelData({ modelId, model }: ModelReference): LLMModelData
getEmbeddingModelData({ modelId, model }: ModelReference): EmbeddingModelData
getRerankModelData({ modelId, model }: ModelReference): RerankModelData
getTTSModelData({ modelId, model }: ModelReference): TTSModelData
getSTTModelData({ modelId, model }: ModelReference): STTModelData
```

函数内部执行以下工作：

1. 按上一节规则解析 modelId 或 legacy model。
2. 校验实际模型类型与 getter 类型一致。
3. 用于执行请求时校验 `isActive`；不存在、类型不匹配或已停用统一抛 `ModelErrEnum.unExist`。
4. 成功时返回确定的模型配置对象，不返回 `undefined`，调用方不再自行选择第一个模型兜底。

额外约束：

- 输入的 `modelId` 不存在时，直接判不存在，不再把它当 `model` 名称查找。
- 兼容分支只能返回 `scope=system` 的模型。
- 历史日志和管理页面若需要读取已停用模型，使用不承担执行校验的 `findModelData(ref)`，不放宽执行请求使用的类型化 getter。
- `getDefault*ModelData()` 与 `get*ModelData(ref)` 分开，后者永远不静默回退默认值。
- 不保留“未命中返回第一个系统模型”的兼容行为，旧数据无法解析时也必须显式暴露问题。

### 6.4 实际模型请求只传 `modelData`

API handler、Dataset/App loader 或 Workflow dispatcher 负责取得一次 `modelData`。从这里开始，后续调用链使用明确对象：

```ts
const modelData = getLLMModelData({ modelId: body.modelId, model: body.model });

await createLLMResponse({
  body: {
    modelData,
    messages
  }
});
```

同样规则适用于 Embedding、Rerank、TTS、STT：

```text
业务/API 边界
  -> getXXModelData({ modelId, model })
  -> modelData
  -> createLLMResponse/getVectors/rerank/speech/transcriptions
  -> provider formatter 读取 modelData.model 和 modelData.config
```

下游 request 类型不得再声明 `model: string | ModelData`、`modelIdOrName` 等联合输入。Usage 新写入链也直接从同一个 `modelData` 取得 `modelId`，避免再次反查；历史 Usage 的 `model` 按既有展示兼容处理。

### 6.5 兼容代码白名单

本轮只允许以下兼容或迁移适配存在：

1. **公开 OpenAPI 请求兼容**：已发布且允许选择模型的 System OpenAPI schema 同时接收 `modelId/model`，`model` 标记 deprecated。
2. **统一模型解析兼容**：`getXXModelData` 与 `findModelData` 接收同一个 `ModelReference`；`modelId` 严格优先，仅缺少 `modelId` 时才按系统 `model` 查询。
3. **历史持久化读取**：Dataset、App、Workflow、Evaluation 和 Usage 在迁移窗口内读取旧 `*Model`、workflow key 或 usage `model`；新写入不得继续产生旧字段。模型权限不保留运行时名称回退，必须先通过 4163 补齐 `resourceId`。
4. **外部协议归一化**：插件 SDK 的扁平模型只在插件适配入口转换成 canonical `config`；旧 `system_models.metadata` 和旧顶层能力字段只允许启动迁移读取和转换。

除以上白名单外，不保留裸字符串 getter、`string | ModelData`、旧扁平模型与 canonical 模型的运行时 union、把 `config` 再展开到全局缓存或 API DTO 的字段别名，或“已经传入模型对象就直接返回”的旁路。管理员页面、普通客户端和服务端统一使用嵌套 `config`。

## 7. 业务字段迁移

### 7.1 字段分类原则

不是所有 `model` 字段都应改名：

- 模型选择/引用：保留并弃用旧 `model`/`*Model` 字段，同时新增 `modelId`/`*ModelId`。
- provider 请求：继续叫 `model`，值为 `modelData.model`。
- Usage：新记录只保存 `modelId`；历史记录保留原有 `model`，两种结构在查询层兼容。

### 7.2 持久化与 API 字段矩阵

| 数据位置                              | 新增字段                                      | 保留的 deprecated 字段                  | 读取优先级          | 新写策略                                                  |
| ------------------------------------- | --------------------------------------------- | --------------------------------------- | ------------------- | --------------------------------------------------------- |
| `datasets`                            | `vectorModelId`、`agentModelId`、`vlmModelId` | `vectorModel`、`agentModel`、`vlmModel` | `*ModelId` 优先     | 只写 `*ModelId`                                           |
| `eval`                                | `evalModelId`                                 | `evalModel`                             | `evalModelId` 优先  | 只写 `evalModelId`                                        |
| `apps.chatConfig.questionGuide`       | `modelId`                                     | `model`                                 | `modelId` 优先      | 只写 `modelId`                                            |
| `apps.chatConfig.ttsConfig`           | `modelId`                                     | `model`                                 | `modelId` 优先      | 只写 `modelId`                                            |
| `apps.modules` / `app_versions.nodes` | 见 Workflow key 表                            | 旧 input key                            | 新 key 优先         | 新节点只写新 key                                          |
| `app_templates.workflow`              | 同 Workflow                                   | 旧模板 key                              | 新 key 优先         | 新模板只写新 key                                          |
| `usage_items`                         | `modelId`                                     | `model`                                 | 两种记录分别展示    | 新记录只写 `modelId`，不迁移历史记录                      |
| 模型权限记录                          | `resourceId`                                  | `resourceName`                          | 只读取 `resourceId` | 新记录按 `resourceId`；4163 可保留旧名称快照但必须补齐 ID |

这里的“保留”针对历史持久化数据和公开 System OpenAPI 合约，包括对应的 TypeScript 类型、Zod/Mongoose Schema、OpenAPI 字段声明和历史数据读取分支：旧字段改为 optional 并标记 `@deprecated`，本轮不得从这些字段定义中删除。非公开 OpenAPI 请求参数与内部临时配置不在对外兼容范围内，只保留 `modelId`。新增 ID 字段不是原字段 rename，也不应通过重建一套 API 实现。

“保留旧字段”不等于新写入继续双写：按已确认的新写规则，新创建的数据只写对应 ID 字段；迁移存量数据时只 `$set` 新 ID sibling，不 `$unset` 旧字段，因此历史值仍然可供兼容读取和回滚。若业务更新采用局部 `$set`，也不得为了清理而主动删除已有 legacy 字段。

### 7.3 Usage 存储与展示

`usage_items` 兼容两种互斥的数据形态：

```ts
// 历史记录
{
  model: 'gpt-4o';
}

// 新记录
{
  modelId: '68ad85a7463006c963799a05';
}
```

新写入链只写 `modelId`，不再冗余写 `model`。历史 Usage 不做 modelId 回填，避免为纯展示数据增加大集合迁移成本，也避免把旧名称改成当前展示名。

列表查询按当前分页收集全部 `modelId`，一次批量读取 `ai_models` 后生成展示字段，禁止逐条查询：

```ts
const displayModel =
  usage.model ?? modelMap.get(usage.modelId)?.model ?? i18nT('account_usage:model_unavailable');
```

展示规则：

1. 历史记录存在 `model` 时原样展示，不查询模型、不转换为 `name`。
2. 新记录存在 `modelId` 时展示当前模型文档的 provider `model`，不是展示名 `name`。
3. `modelId` 无法解析时统一展示“模型已下架”，不暴露内部存储细节。
4. “模型已下架”必须补齐中、英、日多语言。
5. Usage 的积分、token 和 amount 在写入时已经确定，列表解析失败不能影响历史计费数据。

### 7.4 Workflow key

工作流协议在保留旧 key 的基础上新增以下 ID key：

| 保留的 deprecated key         | 新增 key                        |
| ----------------------------- | ------------------------------- |
| `model`                       | `modelId`                       |
| `embeddingModel`              | `embeddingModelId`              |
| `rerankModel`                 | `rerankModelId`                 |
| `datasetSearchExtensionModel` | `datasetSearchExtensionModelId` |
| `datasetDeepSearchModel`      | `datasetDeepSearchModelId`      |

旧 key 必须继续保留在 Workflow input 常量、类型、Zod Schema、模板反序列化和 Dispatcher 读取分支中，并标记 deprecated；本轮不能通过 rename 或删除旧 input 实现迁移。`datasetParams` 复合对象内的同名字段也遵循相同规则。

运行时解析规则：

1. 新 ID key 存在时只读取新 key，并按 `modelId` 解析；即使 ID 无效，也不能回退同一节点中的旧 key。
2. 新 ID key 不存在时才读取 deprecated key，并按系统模型 `model` 兼容解析。
3. 两套 key 都不存在时，按该节点原有的必填或默认模型语义处理，不能统一静默选择第一个模型。

写入和迁移规则：

- 新建节点和新模板只产生新 ID key，不需要额外双写旧 key。
- 数据库批量迁移脚本只回填 ID sibling，不删除历史 key，便于回滚；业务写入边界的 `formatModels` 则产出只含 ID key 的规范节点。
- `formatModels` 只在服务端写入边界执行，客户端不依赖分页模型列表做身份迁移。画布恢复在模板补齐前按原始 key 去重：存在 canonical input 时删除所有 legacy input；只有静态 legacy input 时复用 canonical 模板槽位但保留旧 key，等待保存边界解析；动态 legacy input 可原样迁移到 canonical key。静态旧 `model` 仅在同名、同类型 active 模型存在时转换为 `modelId`；已有动态 `modelId` 时直接保留；已有静态 `modelId` 时严格按 ID 校验，不允许借旧 `model` 修复。
- 对问题引导、模型 TTS、Rerank、查询扩展和深度搜索这类带功能开关的模型字段，功能开启时沿用写入策略校验；功能关闭时若静态模型无效，则改成同类型第一个 active 模型，没有同类型候选时清空且不报错。主模型等无功能开关字段始终视为开启。
- 应用创建、复制和转化使用 `clear` 策略：开启功能的静态引用无法解析时把 canonical `modelId` 值清空，允许用户进入编辑器重新选择。自动保存、保存版本和发布使用 `throw` 策略：聚合全部开启功能中无法解析的静态引用并拒绝写入。两种策略都不做成员模型权限判断。
- 编辑或保存存量 Workflow 时，会将命中的 deprecated input 原位转换为 ID input，不再双写旧 key。
- 运行时没有任何兼容性任意回退：只要 `modelId` 字段存在（包括空字符串）就仅按 ID 解析；只有字段为 `undefined` 才允许按 deprecated `model` 精确查找。ID/名称为空、无效、停用或类型错误均抛错，统一由客户端显示“xxx 模型已停用”。

引用类型 input 的 value 保留原引用路径，仅将旧 key 改为 ID key。运行时引用结果统一按 `modelId` 解释；若上游仍输出旧 `model` 字符串，则直接报“模型不存在”。

### 7.5 需要覆盖的调用链

- LLM：AI Chat、Agent、问题分类、内容提取、工具调用、上下文压缩、辅助生成、Skill 调试。
- Dataset：向量生成、文本余弦、图片理解、查询扩展、深度搜索、rerank、训练和重建 embedding。
- Audio：站内 TTS/STT 配置与调用。
- Evaluation：创建、执行、重试、列表和用量。
- 模型管理：配置接口统一移动到 `/admin/settings/model/*`；create 与 update 分离，detail、update、delete、test、updateDefault 等接口按 modelId 定位，管理列表返回 modelId。
- 辅助 API：Prompt 优化、代码优化、问题引导等由客户端选择模型的接口。
- Usage：Workflow、Agent Loop、Dataset training、Evaluation、TTS/STT 的所有 usage sink。

改造不能停在最终 `getLLMModelData()` 调用点，必须从客户端选择值、API schema、持久化字段、runtime 参数一路追踪到 provider request；完成解析后下游只能传 modelData。

### 7.6 不改名的协议

- OpenAI 兼容的 `/v1`、`/v2` 请求中协议定义的 `model`。
- OpenAI SDK、Embedding、Rerank、TTS、STT 最终请求体中的 `model`。
- AIProxy 当前接收的 provider `model`；modelId 路由属于后续 Channel PR。
- 历史 node response、chat log、request record 中仅用于展示的模型名称快照。

## 8. 权限兼容

现有模型权限虽然仍只管理系统模型，但它也是模型引用，需做最小身份迁移：

- 历史模型权限以 `resourceName` 为身份来源；4163 先从完整 `ai_models` 按 provider model 名精确映射，再补 `resourceId = modelId`。
- `resourceName` 只作为迁移时的旧名称快照保留，不参与运行时权限判断，也不扩展私有模型所有权语义。
- `getMyModels`、`getMyModel` 和协作者 list/update API 只接收 `modelId`，权限查询只使用 `resourceId`。4163 对无法通过现有 `resourceId` 或 `resourceName` 映射到 `ai_models` 的模型权限执行悬空删除；权限迁移不按模型启停状态过滤，也绝不回退到其他同类型模型。
- FastGPT Pro 中现有模型协作者 API 需要同步修改，否则 available model 过滤仍会按名称失配。
- 不在本轮增加“创建者即所有者”、团队成员 groupId、跨成员私有模型授权等规则。

## 9. 客户端可用模型获取优化

### 9.1 服务端接口

管理员模型配置统一放在 `/admin/settings/model/*`，不把账号选择器分页混入管理员管理接口。

将现有 GET `/core/ai/model/getMyModels` 改为当前账号可用模型的分页接口，不额外复制列表路由。请求/响应 contract 移到 `packages/global/openapi/core/ai/model`，复用通用 `PaginationSchema` / `PaginationResponseSchema`：

```ts
export const GetMyModelsQuerySchema = PaginationSchema.extend({
  modelType: ModelTypeSchema.optional(),
  provider: z.string().optional()
});

export const GetMyModelsResponseSchema = PaginationResponseSchema(ClientModelItemSchema).extend({
  providers: z.array(z.string())
});
```

接口约束：

- 列表业务参数只增加 `provider` 和 `modelType`；分页参数使用通用 `pageNum/pageSize` 或 `offset/pageSize`，不在本轮增加搜索、Channel 和创建者筛选。
- 第一版采用服务端内存逻辑分页：先按现有权限口径得到当前账号可用的 active `modelId` 集合，再从 `global.systemActiveModelList` 过滤出 canonical modelData，应用 `modelType`，生成当前成员在该类型下的去重 `providers`，最后按有效 provider 过滤、稳定排序并分页。无需为了分页把插件配置、权限记录和 Mongo 模型文档做复杂 join。
- `providers` 在应用 provider 过滤前计算，并按 provider order 稳定排序；它只返回 provider ID，客户端使用 `getInitData.modelProviders` 补展示名和头像。这样左侧只展示当前成员、当前 `modelType` 下实际有模型的 Provider。
- 请求未传 `provider` 时语义固定为“不按 Provider 过滤”，`total` 表示当前成员、当前 `modelType` 下的全部模型数量，`list` 是跨 Provider 稳定排序后的分页结果。请求显式传入 provider 时，`total/list` 才表示该 Provider 下的结果；不可用 provider 返回空结果，不能静默切换。
- 选择器首次以 `pageNum=1&pageSize=10` 且不传 provider 发起发现请求。`total <= 10` 时，这一页就是单列选择器的完整候选；`total > 10` 时切换为双列选择器，从响应的 `providers` 中选择当前模型的 Provider，若没有当前值则选第一个 Provider，再发起带 provider 的第一页请求。
- 已有选中值通过 `getMyModel` 恢复，并与发现请求并行。若选中模型的 provider 不在可用 `providers` 中，保留异常 value 并显示“xxx 模型已停用”，候选列表使用第一个可用 Provider。
- 不能先对全局模型列表切片再做权限过滤，否则会造成页大小不稳定、total 泄漏和空页。
- 普通分页使用稳定排序，例如 provider order、`name`、`modelId`，保证翻页期间顺序确定；`pageSize` 设置合理上限，建议默认 20、最大 50。
- 移除客户端 `versionKey/isRefreshed` 握手。服务端通过 `TmpDataEnum.MyModels` 按 `{ teamId, tmbId }` 缓存成员可用的 `modelId` 集合，固定 TTL 为一小时；`getMyModels` 和 `getMyModel` 共用该缓存，客户端不维护账号级完整模型缓存。本版本不增加 `permissionVersion`。
- 任意成功的模型新增、更新、启用、停用或删除，在 active 列表重载成功后删除全部 `TmpDataEnum.MyModels` 缓存。新模型在未配置协作者权限时默认可用，如果只清理当前团队或当前成员，其他成员的旧缓存将遗漏该模型；若插件失败导致重载失败，则保留旧 active 列表和旧缓存。
- 模型协作者权限以及影响协作者身份的团队成员、组织、用户组发生变更时，删除对应团队的全部 `TmpDataEnum.MyModels` 缓存。权限写入与缓存删除使用同一 session；删除后由下一次读取惰性重建。
- 缓存失效后不主动遍历成员重建；用户下次请求 `getMyModels` 或 `getMyModel` 时，再按最新 active 模型和权限数据惰性计算并写回 `tmpData`。
- Workflow 导入、创建、保存和发布阶段的 `formatModels` 只负责将可解析的旧 `model` 转换为 `modelId`，不读取 `TmpDataEnum.MyModels` 也不做服务端模型权限判断；权限缓存只服务于前端选择器使用的可用模型接口。本版本只在获取/恢复模型时返回无权限或不可用提示，后端运行和保存链不校验模型权限，因此接受缓存 TTL 内弱一致性的剩余风险。
- `ClientModelItem` 至少包含 `modelId/type/provider/model/name/avatar/isActive`、默认标记和脱敏后的 `config`，不返回 request auth、URL、默认 system prompt 和请求/存储私有配置。
- 不在本接口夹带 Channel 数量、创建者、resourceContext 或私有模型管理字段。
- Query/Response Schema 必须导出对应类型并补齐 API 声明、字段 meta 和 OpenAPI path。handler 使用 `parseApiInput({ querySchema })` 校验 query，并用 `GetMyModelsResponseSchema.parse(...)` 校验返回值。

分页接口只有 `provider/modelType` 时，无法保证当前已选的 `modelId` 恰好位于已加载页面。因此增加一个鉴权的单模型读取接口 `/core/ai/model/getMyModel`，只接收 `modelId`，先校验当前成员确实可用，再返回一个 `ClientModelItem`。该接口是选择器的站内接口，不承担旧 `model` 请求兼容；选择器只用它恢复当前 value，不用它加载候选列表。

### 9.2 客户端状态

- 删除全局 `availableModelList`、五类模型列表、`myModelList.versionKey` 及对应持久化/失效逻辑。客户端不缓存账号完整模型列表，也不在多个选择器之间共享查询结果。
- 每个模型选择器打开时先执行不带 provider 的 10 条发现请求。`total <= 10` 使用单列列表且不展示 Provider；`total > 10` 使用双列列表，并按“当前模型 Provider 优先，否则第一个可用 Provider”请求右侧第一页。点击其他 Provider 时重置到第一页，滚动/翻页只请求当前 Provider 的下一页。`modelType` 改变时重新执行发现请求。关闭或卸载后即可丢弃该选择器的临时分页数据，再次打开重新请求后端。
- 组件仍可持有完成一次交互所需的局部分页状态，但不得写入全局 store、localStorage 或跨选择器 query cache。筛选切换时需取消或忽略过期响应，避免后返回的旧请求覆盖新条件。
- 选择器的 value、权限 Set、默认模型值全部使用 `modelId`，label 继续使用 `name`。
- 当前 value 可能不在第一页：选择器初始化已有值时调用 `/core/ai/model/getMyModel` 恢复选中项，不能通过不断翻页寻找。
- 读取旧业务数据时，单模型接口可用 legacy system `model` 匹配；匹配后增加对应 ID 字段，旧字段按第 7 节规则保留。
- value 非空且单模型接口返回不存在或无权限时，选择框保留该异常值并用红字显示“xxx 模型已停用”，不能自动选中第一页模型。
- value 为空的新建场景可以由业务显式选择默认模型；“缺省选择默认值”和“已有值找不到”必须是两个分支。
- 选择器局部维护 `idle/loading/success/error` 和分页结束状态；只能在请求成功后判断“没有可用模型”，不能把加载中或普通请求失败显示成“xxx 模型已停用”。
- 左侧 Provider 列表使用分页响应的 `providers`，并与 `getInitData.modelProviders` 合并展示信息；不能从当前模型页反推 Provider，否则未出现在第一页的 Provider 会永久缺失。

### 9.3 `getInitData`

从 `GetSystemInitDataResponseSchema` 和 `getInitData` 所有响应分支中删除 `activeModelList`。模型相关数据只保留脱敏后的 `defaultModels`，且每个默认模型必须包含 `modelId`；`feConfigs`、套餐、版本、provider 和 AIProxy 渠道等非模型列表初始化数据保持原有职责。

`defaultModels` 表示平台默认配置，不等于当前账号一定有权限。新建业务采用默认值时，模型选择器仍需通过鉴权的 `getMyModel` 确认该模型当前可用；无权限或已停用时显示“xxx 模型已停用”，不能绕过权限直接提交。

新增无需鉴权的 GET `/common/system/getSystemModels`，供价格表及价格弹窗按需请求全部 active 系统模型的最小公开信息。该接口不分页：完整列表不再进入每个页面都会调用的 init，只在需要展示模型价格时加载；模型数量仍由服务端内存列表提供，不增加数据库查询。

公开响应使用独立 `PublicPriceSystemModelSchema`，只包含：

- 所有类型共有 `name`、`provider`、`type`、`testMode`。
- LLM 仅增加运行时归一化后的 `priceTiers`，以及 `config.maxContext/vision/audio/video/reasoning`。
- Embedding/Rerank 仅增加 `charsPointsPrice` 和 `config.maxToken`；TTS/STT 仅增加 `charsPointsPrice`，不返回空 `config`。

不得返回 `modelId/model/avatar/inputPrice/outputPrice`、`requestUrl/requestAuth`、默认 system prompt、`defaultConfig/fieldMap/dbConfig/queryConfig`、voices、默认模型标记、权限信息或其他管理字段。价格页改为给展示组件显式传入这份公开列表，不再从全局模型 store 读取。该常规公共接口需要完整 Zod contract、响应 parse 和 OpenAPI 文档；因为没有入参，不创建空 Query Schema，也不调用空的 `parseApiInput`。

## 10. OpenAPI 与跨仓库改动

- 已标记 `SystemOpenApiTagMap` 的公开 Dataset API 直接在原 schema 新增 `*ModelId`；旧 `*Model` 字段继续保留并标记 deprecated。只标记 `DevApiTagsMap` 的 Evaluation、辅助 AI 和其他站内 API 只接收 `modelId`。
- `getMyModels` 的分页 query、脱敏 item 和分页 response 在 `packages/global/openapi` 定义并注册现有路由；不继续把 contract 留在 Next.js route 文件中。
- 鉴权的 `getMyModel` 与公开的 `getSystemModels` 分别使用独立最小 Schema，并注册 OpenAPI；不能为了复用直接返回管理员模型详情 DTO。
- 新增或修改的 API 在边界使用 `parseApiInput`；实体自身的 ObjectId 字段复用 `ObjectIdSchema`，模型引用字段统一使用 `z.string()`。
- 模型列表响应的通用业务结构放在 `packages/global/core/ai`，OpenAPI 只组合路由请求和响应。
- FastGPT Pro 至少需要同步 Evaluation 和模型协作者调用方；Pro 的页面布局、渠道页和统计页不随本 PR 进入。
- 外部 OpenAI 兼容接口继续声明 `model`，不要为了内部 modelId 改坏标准协议。
- `admin/4163/backfillModelReferences` 属于一次性升级迁移接口，可豁免 OpenAPI 文档，但仍必须使用 `authCert({ authRoot: true })` 校验部署 `rootKey`，并使用 Zod、`parseApiInput` 和响应 Schema 校验。

## 11. 数据清洗与迁移

### 11.1 模型结构接管与资源迁移

旧版 `cleanSystemModelConfigs` 不再提供。新版本不修改 `system_models`：仅当 `ai_models` 为空时读取旧表，在内存中把全部记录转换为 canonical 结构并提取默认模型 ID，保留原 `_id`，然后在单个事务中一次性写入 `ai_models` 和唯一的 system scope `ai_default_models` 记录。单模型新增/更新和 JSON 批量更新只接受 canonical 数据；JSON 中没有 `modelId` 的旧记录直接过滤。JSON 的未知 `modelId` 表示跨实例导入：目标端按 `model` 复用已有系统实例或创建新实例。

启动迁移、插件模板刷新、自动预装策略和数据库实例加载必须保持四个独立职责：

1. `bootstrapAIModelsFromLegacy` 只在启动阶段运行；目标非空立即跳过，目标为空时只读旧表、全量校验并单事务一次性写入模型和 system 默认配置，不生成缓存，也不由定时任务或管理接口调用。
2. `refreshModelTemplates` 只获取并校验插件模板候选快照；启动失败则阻止启动，热刷新失败则保留上一版模板和 active 缓存，不触发任何数据库变更。
3. `syncPreinstalledSystemModels` 只负责本版本“插件模板缺失实例自动预装”的兼容策略，按 `{ scope, model }` 创建缺失实例，不更新或删除已有实例。PR2 改为模板显式安装时只替换这一层。
4. `loadInstalledModels` 只读取并严格解析数据库实例与 system scope 默认配置，在局部构建 list/map/defaults 后原子发布；不 repair、不拉插件、不创建或删除模型。管理员提交和数据库 Change Stream 只触发这一层。

启动编排为：阻塞执行 `refresh templates -> load current ai_models -> ready`，随后后台执行 `bootstrap legacy -> sync preinstalled -> reload installed -> invalidate caches`。因此允许目标表为空时短暂找不到模型；迁移失败时事务不留下部分数据，也不执行自动预装，下次重启重试。运行期模板刷新为 `refresh templates -> sync preinstalled -> load installed`；管理员写入为 `validate/preflight -> transaction -> load installed`。

`admin/4163/backfillModelReferences` 只建立 `ai_models.model -> _id` 映射，目标表为空时拒绝执行，避免在启动迁移完成前产生错误回填。它给 Dataset、App/Workflow、Evaluation 和模型权限记录增量补充 ID sibling；Usage 历史记录不回填。接口仅允许持有部署 `rootKey` 的升级操作执行，`dryRun` 默认为 `true`，响应按 `datasets/apps/evaluations/permissions` 分组返回 `scanned/unchanged/wouldUpdate/updated/wouldDelete/deleted/invalid/unresolved/conflicts`。

4162 只负责团队、协作者以及 App、Dataset、AgentSkill 等通用权限引用清理，不读取 `ai_models`，也不判断模型权限的 `resourceId`。模型权限运行时只读取 `resourceId`，因此 4163 在同一阶段先按 `resourceName` 补 ID，再删除仍无法映射到 `ai_models` 的模型权限；删除使用读取快照约束，避免覆盖并发写入。

该接口属于一次性升级清洗能力，可以不注册 OpenAPI path，但不豁免安全和校验：使用 `authCert({ authRoot: true })` 校验部署 `rootKey`；请求使用 Zod Schema + `parseApiInput`；结构化响应使用 Zod Schema parse；`dryRun` 默认必须为 `true`，只有显式传 `false` 才允许写入。

### 11.2 执行顺序

```text
部署启动
  -> 成功读取完整插件模型列表（失败则实例不启动）
  -> 读取 ai_models 并发布当前 active 模型缓存（允许为空）
  -> 后台检查 ai_models 是否为空
  -> 一次读取全部 system_models，在内存中转换并严格校验
  -> 单事务复查 ai_models 为空，并用一次 insertMany 保留 _id 写入全部模型
  -> 在同一事务把旧 isDefault* 标记转换为唯一的 system scope ai_default_models 记录
  -> 物化缺失的插件系统模型
  -> 重载 active 模型并失效配置/成员模型缓存

部署完成后执行资源回填
  -> 预检 / dry-run
  -> 回填 datasets
  -> 回填 apps / app_versions / app_templates
  -> 回填 eval
  -> 按 resourceName 回填模型 permission.resourceId
  -> 删除仍无法映射到 ai_models 的模型权限
  -> 输出复核报告
```

### 11.3 迁移规则

- `system_models -> ai_models + ai_default_models` 按已确认约束一次读取、一次事务、一次 `insertMany` 和一次默认配置 upsert，不分批、不加锁、不保存迁移状态。
- 模型结构归一化优先级为 `canonical config > 旧顶层字段 > metadata`；同层冲突记入报告。
- 根据模型 `type` 使用白名单把类型特有字段写入 `config`，未知字段不自动搬运。
- 新代码只写 `ai_models` 的 canonical 顶层字段和 `config`；不再写 `metadata`、默认标记或顶层类型特有字段。
- 迁移候选只保留 `_id` 与 canonical 字段，因此 `isSystem`、`metadata`、`isDefault*` 和旧顶层能力字段不会进入新表；旧表原文档完全不变。
- 任一旧记录无法转换或出现重复 `_id` 时，在开启写事务前失败，目标表保持为空；重复 `model` 按 `_id` 升序读取，后一个记录覆盖前一个记录并保留其 `_id` 与配置。
- 多实例并发不使用分布式锁；事务内复查目标为空，竞争失败实例仅在确认另一实例已完整写入同一组 `_id` 和相同 system 默认配置后收敛为成功。
- 4163 先检查已有静态 `modelId`：只要它指向符合类型要求的系统模型就保持不变，不按启停状态过滤，也不能被 legacy 名称覆盖，确保重复执行幂等。动态 `modelId` 不做校验，直接保留。
- 仅当已有静态 ID 缺失或无效时尝试同名、同类型精确匹配；精确匹配失败才允许在 4163 内选择同类型系统模型作为一次性业务引用迁移回退。字段完全不存在时不主动补默认模型；所需类型没有候选时不写入并计入 unresolved。运行时和普通写入链均不得复用 4163 的任意回退语义。
- Workflow 的 legacy `model` input 如果是引用类型、数组引用或模板表达式，原值复制到 `modelId` sibling，不做静态模型校验；4163 保留旧 input 便于回滚，普通保存则只保留 canonical ID key。
- 模型权限单独遵循身份映射规则：有效 `resourceId` 保留；否则按 `resourceName` 精确映射任意现存系统模型；仍无法映射则作为悬空权限删除。权限不允许使用同类型候选回退。
- 所有集合的回填写入都对读取过的 legacy 源字段和待写目标字段做快照 CAS；Workflow 整体数组按读取快照匹配。并发保存导致的未命中记为 conflict，可通过重跑收敛，不能覆盖用户刚保存的数据。
- 4163 映射只使用 `ai_models` 系统模型 `model`；发现空表、重复或歧义必须在写业务数据前终止。
- `usage_items` 不参与历史引用回填；仅新写入链开始保存 `modelId`。
- 每一步返回 scanned/migrated/unchanged/unresolved/conflicts；整个接口保持幂等，可以安全重跑，不能依赖上一次请求的进程内状态。

### 11.4 发布兼容边界

本方案是“新代码兼容旧数据”，不是完整双向兼容：

- 旧记录迁移时保留 legacy 字段，因此回滚旧镜像仍能读取这些旧记录。
- 新版本创建的记录只写 modelId，旧镜像无法读取这部分新记录。
- 资源引用回填在新版本部署完成后执行；普通业务引用在回填前兼容读取 legacy 字段。模型权限运行时只读 ID，但后端执行链暂不鉴权，因此迁移窗口内权限暂时失效已明确接受，不作为本 PR 阻塞项。新写入仍只写 modelId，故不能在会同时处理写请求的新旧应用实例之间长期滚动混跑。
- FastGPT 与 Pro 滚动发布期间，新 Usage 的 modelId 可能暂时无法被旧侧展示解析；该短窗口仅影响模型归因展示，金额和 token 不受影响，已明确接受，不增加双写。
- 如果部署要求新旧实例长期混跑，就必须临时双写 legacy 字段；这与“新保存只有 modelId”的已确认要求冲突，需要另行决策，不能隐式实现。

## 12. 代码改动分区

| 分区                                                               | 主要改动                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `packages/global/core/ai`                                          | 模型对象增加 `modelId`，定义各类型 config 和客户端脱敏类型                          |
| `packages/service/core/ai`                                         | 扁平 schema、config normalize、索引、物化、ID cache、getter、active guard、迁移服务 |
| `packages/global/core/dataset` + `packages/service/core/dataset`   | Dataset schema/API/runtime 改 `*ModelId`                                            |
| `packages/global/core/workflow` + `packages/service/core/workflow` | input key、模板、dispatcher、Agent/搜索调用链                                       |
| `packages/global/core/app` + `packages/service/core/app`           | chatConfig、Evaluation、app/appVersion/template 兼容                                |
| `packages/service/support/wallet/usage`                            | usage item 增加 modelId，所有写入链透传 ID                                          |
| `packages/service/support/permission/model`                        | available model 与权限资源改按 modelId                                              |
| `projects/app/src/pages/api`                                       | 分页可用模型 API、升级后的单一清洗入口和已有 OpenAPI contract 对齐                  |
| `projects/app/src/web` / UI                                        | 选择器按需分页请求、selector value、表单默认值和旧数据显示兼容                      |
| `pro`                                                              | Evaluation、模型协作者接口的最小 modelId 同步                                       |

实施时应通过类型错误和 `rg` 审计所有调用点，不能直接复用原 PR 的 300+ 文件列表；原列表混入了 Channel、私有模型、管理员统计和页面重构。

## 13. 测试与验收

### 13.1 单元测试

- Schema：系统模型重复 `model` 被拒绝；未来 `scope=team` 不受系统 partial index 错误约束。
- Config schema：各模型类型必填/可选字段正确；schema 保持类型精确但不使用 `.strict()`，未知字段由 Zod 默认剔除，跨类型已知字段也不会进入解析结果。
- Index manager：旧 `model_1` 被精确识别为 deprecated，新 partial unique index 被保留。
- 物化：首次生成 ID、旧同名文档原地接管且 ID 不变、重复同步 ID 不变、多实例重复键收敛；启动插件失败会阻止启动且不修改 DB，重载插件失败会保留上一版 active 模型与权限缓存。
- Model reference schema：只传 modelId、只传 deprecated model、两者同时存在时只认 modelId、无效 modelId 加有效 model 仍报错、两者缺失分别覆盖。
- Getter：ID 命中、旧系统 model 命中、私有/未知名称不命中、未知 `modelId` 不回退，所有未命中统一抛“模型不存在”。
- Request types：LLM、Embedding、Rerank、TTS、STT 下游只接受对应 modelData，字符串输入在类型检查阶段失败。
- Client model formatter：敏感字段被删除，默认模型 ID 和 capability 正确。
- 可用模型分页：先权限过滤再分页、稳定排序、pageSize 上限、`modelType` 下 Provider 聚合、未传 provider 返回跨 Provider 总量、显式 provider 过滤、无效 provider 返回空结果；模型变更清理全部成员缓存、权限变更清理对应团队缓存分别覆盖。
- 单模型读取：当前成员有权/无权、只传 modelId、只传 deprecated model、两者同时存在及无效 modelId 不回退分别覆盖。
- 公开系统模型：无需鉴权、只返回 active 模型和白名单基本/价格/能力字段，所有敏感字段均被剔除。
- Init schema：响应不再包含 `activeModelList`，`defaultModels` 中的模型包含 modelId 且敏感配置被删除。

### 13.2 迁移测试

- datasets、apps、app_versions、app_templates、eval、model permissions 分别覆盖正常、幂等、unresolved、conflict。
- Workflow 字面量旧 input 覆盖“将 key 和 value 转换为 ID”；引用型旧 input 覆盖“只改 key、保留引用值”；`datasetParams`、chatConfig 分别覆盖。
- 启动迁移覆盖 canonical/旧 metadata/新旧混合、插件模板恢复、保留 `_id`、旧表不变、失败零写入和目标非空跳过。`backfillModelReferences` 覆盖空目标拒绝、dry-run、正式执行、unresolved/conflict 和各引用集合。
- 大批量游标执行会分批 flush，不会把未解析字符串写入任何 `*ModelId`；并发保存使快照 CAS 未命中时保留在线数据并报告 conflict。

### 13.3 集成测试

- 新建/编辑 Dataset 后数据库只出现 `*ModelId`，训练、搜索和重建 embedding 正常。
- 新建 Workflow 只产生 ID key；导入、编辑或保存旧 Workflow 后只保留对应 ID key，静态值转换为 ID，引用值保留引用路径。
- Evaluation 历史持久化数据仍能按 `evalModel` 读取；站内新请求只接收并落库 `evalModelId`。
- Prompt 优化、代码优化、问题引导、TTS/STT、Agent Loop 均从 modelId 解析，但 provider 收到正确 `model`。
- 模型能力读取统一来自 `modelData.config`，客户端拿不到 config 中的敏感服务端字段。
- 非法或已删除模型不会调用第一个系统模型；API 统一返回“模型不存在”。
- 模型选择器对不在 available list 的非空 value 显示红色“xxx 模型已停用”，不自动改值或选择第一项。
- `getMyModels` 在权限过滤后按 `provider/modelType` 稳定分页；不同选择器不会复用全局模型结果，非第一页的当前值通过 `getMyModel` 恢复。
- 可用模型总数不超过 10 时选择器只发一次发现请求并展示单列；超过 10 时展示 Provider 双列，并按当前模型 Provider 或首个 Provider 加载右侧分页。
- `getInitData` 所有登录/未登录分支都不返回完整模型列表，只返回允许暴露的默认模型；价格页通过公开 `getSystemModels` 获取最小列表。
- Usage 新记录只包含 `modelId`；旧记录原样展示 `model`；新记录批量解析 provider `model`，无法解析时展示“模型已下架”。
- 切换团队/成员后不会短暂显示上一身份的模型列表。
- `/price` 未登录价格展示不回归。

### 13.4 验收条件

- 每个 active 系统模型都有稳定、可重复读取的 modelId。
- 新创建的业务配置不再保存旧 `model` 字符串引用。
- 新版本上线时对 legacy 引用的运行时读取兼容可用，资源回填不作为切流阻断项；上线后执行 dry-run 和正式回填，最终要求所有可解析引用完成回填，并将 unresolved/conflict 收敛为 0。
- 旧系统 model 兼容调用可用，未知模型不会静默调用默认模型。
- 公开 System OpenAPI 的兼容字段 `model` 已标记 deprecated，内部模型请求链不存在字符串 model reference。
- 账号可用模型只通过分页 `getMyModels` 按需获取，客户端不存在账号级完整模型缓存。
- provider/AIProxy 收到的仍是正确 provider model 名。
- PR diff 中不包含 Channel、私有模型 CRUD、管理员统计，也不重复管理员页面迁移；必要的前端改动直接基于 upstream main 当前管理员目录完成。

## 14. 风险与后续清理

- 插件模型未物化会导致部分模型没有 ID，因此插件列表获取失败必须阻止启动；运行时重载失败则保留上一版 active 模型，不进入半更新状态。
- 本版本不增加 `permissionVersion`，模型选择权限只在获取模型时提示且后端执行链不校验；一小时 TTL 作为兜底，正确性主要依赖模型变更后的全量缓存删除和权限变更后的团队缓存删除。
- new-write-only-ID 使旧镜像不能读取升级后新数据，发布流程必须接受这一限制。
- Workflow 是动态结构，单靠 TypeScript 无法证明无遗漏，必须同时做迁移样本和静态 key 审计。
- config 嵌套会影响当前所有 `modelData.maxContext/vision/...` 调用点，必须通过静态审计确保没有继续读取旧顶层类型字段。
- Usage 列表必须批量解析 modelId，不能形成 N+1；模型缺失时只能影响展示，不能影响历史金额和 token。
- 本轮不删除任何 legacy 模型引用字段。未来是否删除 deprecated 字段、兼容索引和 fallback 必须另行评估存量调用方并单独决策，不能把删除视为本 PR 的默认后续步骤。

### 14.1 后续可移除或收紧的兼容清单

兼容层不能只按发布时间删除，必须先证明对应旧输入已经不再产生、存量数据已经收敛，并且受支持的最低升级路径不再依赖该兼容。各层目标如下：

| 兼容层                                           | 当前用途                                                                                                   | 后续目标                                                                                | 移除或收紧前置条件                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 启动时 `system_models -> ai_models + ai_default_models` 迁移 | 首次升级时保留旧 `_id`，把旧模型结构修复为 canonical 结构，并将 `isDefault*` 转为唯一的 system scope 默认配置 | 删除启动迁移、legacy repair 和旧集合读取代码；是否物理删除 `system_models` 另行执行 | 所有受支持部署都至少成功启动过一次新版本；`ai_models` 与 system 默认配置均校验通过；最低支持升级版本不再允许从只含 `system_models` 的版本直接升级 |
| 插件模型自动预装                                 | 本版本为所有插件模板补齐数据库实例，保证每个系统模型都有稳定 ID                                            | PR2 改成管理员从模板显式安装，不再因插件出现模板就自动创建实例                          | 模板安装流程、默认模型保障和空实例引导已上线；升级部署不会因为关闭自动预装而没有可用模型                                                                                                                   |
| `admin/4163/backfillModelReferences`             | 给 Dataset、App/Workflow、Evaluation 和模型权限补 ID sibling；已有 ID 不合法且 legacy 名称精确匹配失败时使用第一个同类型系统模型回退，不按启停状态或成员权限过滤 | 完成上线回填和复核后下线一次性接口；后续严格迁移不得再静默猜测模型                      | dry-run 与正式执行完成；`unresolved/conflicts` 收敛为 0；各目标集合不存在缺少合法 ID 的有效记录；保留执行审计结果                                                                                          |
| Dataset、Evaluation、App chatConfig 的旧字段读取 | 兼容 `vectorModel/agentModel/vlmModel`、`evalModel`、问题引导和 TTS 的 `model`                             | 持久化 Schema 和内部 API 改为按业务条件要求 `*ModelId`；运行时只读取 ID；随后删除旧字段 | 所有写入口只写 ID；存量回填完成；导入、复制、恢复旧版本等入口会先规范化；条件可选字段单独定义，例如 VLM 未启用、问题引导关闭或 TTS 非模型模式时仍可没有 ID                                                 |
| Workflow 旧 key 与保存清洗                       | 兼容 `model/rerankModel/...` input；`formatModels` 在导入、创建、保存、发布时将静态旧名称转换为 ID key     | 所有写入边界统一规范化；运行时 Dispatcher 只读取 ID key，不再读取 `model`               | 存量 App、AppVersion、AppTemplate 已回填；所有导入/复制/保存入口均调用同一清洗函数；静态旧名称可转换或明确报错；动态 `{{...}}` 和引用型输入的上游输出协议已明确为 modelId，不能把运行时得到的旧名称误当 ID |
| 统一模型解析中的 `model:<name>` 索引             | `getXXModelData`/`findModelData` 在没有 modelId 时兼容查找旧系统模型名称                                   | 删除 `ModelReference.model`、名称索引和 getter 的名称分支，只保留 `id:<modelId>`        | 上述持久化、Workflow、公开 API、权限和前端兼容均已退出；代码审计不存在 `getXXModelData({ model })`；该项应最后删除                                                                                         |
| 公开 System OpenAPI 的 deprecated `model` 参数   | 已发布外部调用方仍可按系统模型名称请求                                                                     | 在独立 API contract cleanup 版本删除旧参数，只接收 modelId                              | 已公告废弃窗口；调用日志证明旧参数使用量可接受或为 0；SDK、文档和外部集成完成迁移。OpenAI `/v1`、`/v2` 标准协议的 `model` 不属于此清理                                                                     |
| 模型权限 `resourceName`                          | 仅供 4163 将旧权限映射到 `resourceId`，运行时不按名称回退                                                  | 权限记录最终只保留 `resourceId`，后续删除旧名称字段及其索引                             | 权限回填完成；不存在 model 权限缺少 `resourceId`；旧名称快照不再承担审计或回滚用途                                                                                                                         |
| 前端旧值恢复和显示                               | Evaluation、默认模型、语音配置等页面同时把字符串当作 modelId 或旧 model 精确查找                            | selector、表单、详情页只持有和请求 modelId                                              | 后端响应和持久化均已收敛；异常值保持原值并显示“xxx 模型已停用”，不能恢复为选择默认或同类型第一个模型                                                                                                      |
| 历史 Usage 的 `model` 展示                       | 历史明细不回填 ID，直接显示写入时的 provider model 快照                                                    | 可长期保留为历史展示协议；只有在 Usage 生命周期结束或完成专门迁移后才删除               | TTL 范围内已不存在旧 Usage，或完成不会改变金额、token 和历史展示语义的专项迁移。它不应阻塞业务配置改成 modelId 必填                                                                                        |

以下两项虽然仍使用 `model`，但不能与 legacy 引用兼容一起直接删除：

1. **模型配置 JSON 的跨实例导入**：未知 `modelId` 代表源实例身份无法在目标实例复用，当前仍需用 canonical 记录中的 `model` 对齐或新建系统模型。后续只有引入跨实例稳定的模板身份后，才能取消该规则；团队模型导入不得仅凭 `model` 跨团队合并。
2. **插件模板适配**：插件返回的 provider `model` 及其配置仍是模型模板协议的一部分。可以随插件协议升级删除旧扁平能力字段适配，但 provider 请求最终仍必须使用 `modelData.model`，不能改成发送 modelId。

### 14.2 与团队安装的边界

团队安装引入后，`model` 名称不再足以表示全局身份，因此当前兼容必须遵守以下边界：

1. 旧 `model` 查找和 4163 中的 `resourceName -> resourceId` 映射始终只允许命中 `scope=system`；运行时权限不读取 `resourceName`，也不得按名称选择团队模型。
2. 团队模型从第一版开始只持久化、传输和授权 `modelId`，不新增团队级名称 fallback。
3. 如果统一模型缓存未来同时装载系统与团队模型，兼容名称索引必须与 ID 索引物理隔离，或继续放在只含系统模型的 Map 中；不能建立无 scope 的全局 `model:<name>` 索引。
4. 模型配置 JSON 的名称对齐只用于管理员导入系统模型。团队安装应使用模板 ID、安装记录 ID 或其他明确身份，不能复用这条跨实例名称匹配规则。
5. PR2 应先移除“插件模板自动预装全部系统模型”的策略，否则团队安装阶段会同时存在平台自动安装和团队显式安装两套所有权语义。

### 14.3 建议清理顺序与验证门槛

建议把清理拆成三个互不混淆的阶段：

1. **先收敛写入**：上线后执行 4163；统计各集合缺失、非法和无法解析的 ID；确保 Dataset、Evaluation、App、Workflow、权限及 Pro 写入口只产生 ID。持久化字段的“必填”应是条件必填，而不是把所有可选模型功能强制开启。
2. **再收敛读取**：Workflow 导入和保存先清洗旧静态名称为 modelId；无法转换的数据在写入边界明确拒绝或报告。确认运行时不再收到旧 key 后，删除 Dataset/Evaluation/App/Workflow/权限和前端的名称 fallback。
3. **最后删除底层兼容**：删除统一 getter 的 `model` 入参和 `model:` 缓存索引；再根据最低支持升级版本删除启动迁移及 `system_models` 读取。公开 OpenAPI 和历史 Usage 按各自生命周期独立清理，不与内部运行时清理强绑定。

每次进入下一阶段前至少验证：

- 数据扫描中，所有启用中的业务配置均存在类型正确且可解析的 modelId；VLM、TTS、问题引导等可选能力按启用状态判断。
- 代码静态审计中，除 provider 协议、模型配置导入和明确保留的历史展示外，不再把 `model` 当作平台模型身份。
- Workflow 样本覆盖静态值、引用值、`{{...}}` 动态值、重复 key、缺失模型和错误类型；不能仅凭普通 AI Chat 节点通过就删除运行时兼容。
- FastGPT 与 FastGPT Pro 的 Evaluation、模型协作者和权限缓存行为同步通过验证。
- 回滚策略已明确：删除 legacy 字段或旧集合后，旧镜像不再具备读取新数据的能力，不能再把回滚视为无数据风险操作。

## 15. 实施 TODO

- [x] 建立 modelId 基础类型、扁平 `ai_models` schema、各类型 config schema和索引声明，并保留只读 `system_models` 回滚快照。
- [x] 实现插件/旧 metadata/旧顶层字段到 canonical config 的统一 normalize。
- [x] 实现插件系统模型物化，验证 ID 稳定性和并发收敛。
- [x] 重构服务端 ID cache/getter，移除显式未命中时的默认回退。
- [x] 给公开 System OpenAPI 的模型选择接口增加 `modelId/model` 兼容 schema，并将 model 标记 deprecated；非公开接口（包括 Dev-only OpenAPI）只接收 `modelId`。
- [x] 将 LLM/Embedding/Rerank/TTS/STT request 链改为只接收 modelData。
- [x] 给 Dataset 字段、API、runtime、队列和前端表单新增 `*ModelId`，保留并弃用旧 `*Model` 字段。
- [x] 给 Workflow 增加 canonical ID key，保留并弃用旧 key，改造模板、dispatcher、Agent/搜索/辅助调用链。
- [x] 改 App chatConfig、app/appVersion/appTemplate 读写兼容。
- [x] 给 Evaluation schema/OpenAPI/FastGPT Pro 调用方新增 `evalModelId`，保留并弃用 `evalModel`。
- [x] 给 Usage 新写入链增加 `modelId`，保留历史 `model` 读取，并实现批量解析与“模型已下架”多语言回退。
- [x] 将现有模型权限资源和 available model 接口迁移到 modelId。
- [x] 删除客户端完整模型列表和 versionKey 缓存，改造模型选择器按打开、翻页、`provider/modelType` 筛选独立请求，并通过单模型接口恢复当前 value。
- [x] 将 `getMyModels` 改为内存权限过滤后的分页脱敏模型接口，只支持通用分页、provider 和 modelType；增加鉴权的 `getMyModel`。
- [x] 从 `getInitData` 删除 `activeModelList`，只保留带 modelId 的脱敏 `defaultModels`；新增公开最小化 `getSystemModels` 并迁移 `/price`。
- [x] 给所有模型选择器增加 legacy value 归一化和红色“xxx 模型已停用”状态。
- [x] 将模型结构接管改为启动逐模型 repair，新增 4.16.3 资源引用 dry-run/回填接口，并移除新版旧 cleaner 路由。
- [x] 补齐局部单测、迁移测试、核心集成测试和 Pro 测试。
- [x] 执行静态残留审计、局部测试、类型检查，最后运行全量测试。
- [x] 收紧运行时解析：`modelId !== undefined` 时禁止按 legacy model 回退，并覆盖空字符串、错误类型和停用模型。
- [x] 重构 `formatModels` 为 `clear/throw` 两种缺失策略；创建/复制/转化清空，保存/发布聚合报错，客户端导入不预清洗。
- [x] 修正 4163 优先级和回退范围，保证有效 ID 幂等；无效 ID 可按 legacy 精确映射或回退到第一个同类型系统模型，不按启停状态或成员权限过滤。
- [x] 管理员 detail 返回完整配置、list 保持脱敏；移除导入 schema 的 `.strict()` 并补完整 round-trip 测试。
- [x] 所有模型选择器保留异常值且统一显示“xxx 模型已停用”，修正 Chat/TTS/QG/Skill Preview/Chat Agent Helper 的 ID 语义。
- [x] 在权限写入口清理同模型旧 resourceName ACL，并记录权限迁移和 Core/Pro 滚动展示风险为已接受非阻塞项。
- [x] 修复可选功能关闭时的模型回退，并保证功能开启的保存仍拒绝无效静态模型。
- [x] 修复 Workflow 动态引用统一写入 modelId key，并清理保存结果中的 legacy model 字段。
- [x] 从 4162 移除模型权限清理，在 4163 完成 resourceName 映射和悬空模型权限删除。
- [x] 补齐上述规则的单元测试并在本地环境验证。
- [ ] 新版本部署完成后执行 dry-run 和正式回填，复核并重跑并发 conflict，最终解决全部 unresolved/conflict。
