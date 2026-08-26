# 模型引用统一为 modelId 设计

状态：待实现

最后核对：2026-08-25

## 1. 背景

当前系统同时把 `model` 用作三种不同语义：

1. 模型配置的查找键，例如 `gpt-4o`。
2. Dataset、Workflow、Evaluation 等业务数据中保存的模型引用。
3. 发给 OpenAI 兼容接口和 AIProxy 的 provider model 名称。

这三种语义混用后，模型展示名、provider model 名、平台内模型配置无法稳定区分；同时，现有缓存同时用 `model` 和 `name` 建索引，显式传入一个不存在的模型时还可能静默回退到默认模型。

本轮只解决“平台内模型引用统一为 `modelId`”。渠道、私有模型管理、管理员统计等能力从原 PR 中拆出，不在本轮实现。

## 2. 已确认前提

- 历史 `system_models` 数据全部视为系统模型。
- 历史业务引用保存的是系统模型 `model`，不是私有模型引用。
- 新保存的业务配置只保存 `modelId`。
- 新 Usage 只保存 `modelId`；历史 Usage 的 `model` 不迁移、不转换展示名，查询时原样展示。
- 后端在过渡期仍兼容按旧 `model` 查找，但旧值只能命中系统模型。
- 私有模型只能传 `modelId`；本轮不实现私有模型 CRUD、所有权和渠道。
- 当前账号可用模型通过分页接口按需获取；各模型选择器直接请求后端，不维护客户端完整模型缓存。
- `getInitData` 不再返回完整模型列表，只保留脱敏默认模型。
- 保留 `cleanSystemModelConfigs` 路由，但实现直接升级为本轮新的结构清洗和引用回填逻辑。

## 3. 目标与非目标

### 3.1 目标

- 以 `system_models._id` 作为平台内唯一、稳定的模型身份。
- 所有“选择/引用某个模型”的新业务数据改存 `modelId`。
- 所有内部模型调用链先用 `modelId` 解析配置，再在 provider 边界使用 `modelData.model`。
- 只有公开 OpenAPI 兼容接收 `modelId/model`，只在 OpenAPI 边界解析一次；非 OpenAPI 接口和内部临时配置只接收 `modelId`，进入实际模型请求链后只传 `modelData`。
- 旧数据、旧请求中的系统模型 `model` 在兼容窗口内仍可读取。
- 提供可审计、可重复执行、不会把脏值写入 `*ModelId` 的迁移工具。
- 客户端按当前成员分页获取可用模型，不缓存完整清单；全局初始化接口只返回默认模型。

### 3.2 非目标

- 不引入私有模型、`tmbId/teamId` 所有权、创建者、成员组授权等新业务。
- 不引入或改造 Channel，不让 AIProxy 在本轮按 `modelId` 路由。
- 不实现 root/成员维度的模型日志、统计和渠道消耗分组。
- 以 upstream main 已完成移动后的管理员模型页面为基线，只在新位置修改 modelId 相关的数据读取、表单和选择器；不恢复旧页面、不复制旧组件，也不重复提交页面迁移改动。
- 不新增 `default_models` 表；本轮只重构 `system_models` 自身的存储结构。
- 不删除历史兼容字段；删除动作放到后续 contract cleanup 版本。
- 不做与 modelId 无关的 OpenAPI、价格、权限框架或目录重构。

## 4. 术语与不可破坏的约束

| 名称 | 含义 | 是否可作为业务外键 |
| --- | --- | --- |
| `_id` | MongoDB 中 `system_models` 文档主键 | 仅数据库内部使用 |
| `modelId` | `_id.toString()`，平台模型唯一身份 | 是，唯一 canonical 引用 |
| `model` | provider 侧路由名称，例如 `gpt-4o` | 否；仅兼容旧引用和 provider 请求 |
| `name` | 用户可见展示名 | 否 |
| `isSystem` | 是否为平台系统模型 | 本轮所有模型固定为 `true`，用于限定兼容解析和唯一索引 |
| `isCustom` | 是否不在插件模板中 | 运行时根据模板匹配结果派生，不能表示所有权，不能参与身份判断 |

核心约束：

1. `modelId` 一旦生成，不因模型改名、配置更新、插件重载而变化。
2. `modelId` 字段只允许写入有效 ObjectId 字符串，不能写入未解析的 `model/name`。
3. 显式传入无效模型时必须报不存在或不可用，不能回退默认模型。
4. 只有参数确实缺省、且业务定义允许默认值时，才显式调用默认模型 getter。
5. provider 请求仍发送 `modelData.model`；不能把 Mongo ObjectId 直接发给 OpenAI 兼容接口。
6. 模型解析只发生一次；完成解析后的内部 request 函数只接收具体 `modelData`，不再接收 modelId、model 或二者的联合字符串。

## 5. `system_models` 数据模型

### 5.1 扁平管理字段 + 类型化 `config`

移除 `metadata` 这个无边界的万能容器。模型身份、管理、路由、计费和默认标记放在顶层；不同模型类型的调用能力和参数集中放入一个有明确 Schema 的 `config` 对象：

```ts
type SystemModelDocument = {
  _id: ObjectId;

  model: string;
  type: ModelTypeEnum;
  provider: string;
  name: string;
  isSystem: true;
  isActive: boolean;
  testMode?: boolean;

  requestUrl?: string;
  requestAuth?: string;

  charsPointsPrice?: number;
  priceTiers?: ModelPriceTier[];
  inputPrice?: number;
  outputPrice?: number;

  isDefault?: boolean;
  isDefaultDatasetTextModel?: boolean;
  isDefaultDatasetImageModel?: boolean;
  isDefaultChatTitleModel?: boolean;

  config: ModelConfig;
};

type RuntimeSystemModel = Omit<SystemModelDocument, '_id'> & {
  modelId: string;
  avatar?: string;
  isCustom?: boolean;
};
```

字段归属遵循以下规则：

- 顶层字段回答“这是谁、由谁提供、是否启用、如何连接、如何计费、是否为默认模型”。
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

插件协议不提供 `isSystem`、`isActive`、`testMode`、默认模型标记、`requestUrl`、`requestAuth` 和 `priceTiers`。其中 `isSystem` 在本轮固定写为 `true`，其余均为 FastGPT 数据库业务字段。

插件数据进入系统时，只允许由一个 normalize 函数完成以下转换，数据库、API 和缓存不得各自实现字段分拣：

1. `maxTokens` 映射为 `config.maxResponse`，其余类型能力字段放入对应 `config`。
2. `type/provider/model/name` 保留为顶层初始化字段。
3. 插件的旧价格字段保留为顶层初始化价格，不放入 `config`。
4. 插件中的 deprecated 场景开关只用于旧数据兼容，不进入新的 canonical schema。

模型加载阶段不得再使用 `{ ...pluginModel, ...dbModel }` 合并整个对象。数据库文档是实际模型的权威来源；插件模板只参与 `config` 默认值补齐，并提供首次物化时的身份、展示和价格初始值：

| 字段 | 首次物化来源 | 后续加载/同步规则 |
| --- | --- | --- |
| `_id/modelId` | MongoDB | 永不被插件改变 |
| `model/type` | 插件模板初始化 | DB 权威；与插件不一致时记录配置错误，不静默覆盖 |
| `provider/name` | 插件模板初始化 | DB 权威，允许管理员调整；插件更新不覆盖 |
| `isSystem` | FastGPT 固定写入 `true` | 本轮不可由管理员修改，插件不参与 |
| `isActive/testMode`、默认标记、连接信息 | FastGPT 默认值或管理员配置 | 只读 DB，插件不参与 |
| 价格字段 | 插件模板初始化 | DB 权威，插件更新不覆盖管理员价格 |
| `config` | 插件能力配置初始化 | `plugin config defaults + DB config override` |
| `avatar/isCustom` | 不持久化 | 分别由 provider 和是否命中插件模板派生 |

`config` 合并必须按类型 Schema 的第一层字段处理，DB 中“字段存在”即覆盖插件值，不能用 truthy 判断而丢失 `false`、`0` 或空数组。`defaultConfig`、`fieldMap`、`dbConfig`、`queryConfig` 等对象字段由 DB 整体覆盖，不做递归深合并；数组同样整体覆盖。没有插件模板的模型要求 DB `config` 完整，校验失败应暴露配置错误，不能从其他模型借默认值。

客户端也接收 `config`，但必须返回脱敏子集，例如最大 token、vision、audio、reasoning、toolChoice 和 voices；`defaultSystemChatPrompt`、`defaultConfig`、`fieldMap`、`dbConfig`、`queryConfig` 不返回普通客户端。

### 5.4 系统模型物化

当前插件返回的模型可能没有对应的数据库文档。如果只给现有 DB 文档增加 `modelId`，未被管理员改过的插件模型仍然没有稳定 ID，因此必须先物化：

1. 启动或显式同步时读取插件模型模板和 `system_models`。
2. 对每个插件模型按 `{ isSystem: true, model }` 执行幂等 upsert；兼容迁移完成前，先按旧 `{ model }` 查找并接管已有文档，不能给缺少 `isSystem` 的同名文档重新生成 ID。
3. 已存在的文档保留 `_id` 和管理员顶层配置；`config` 仅用插件模板补齐 DB 中缺失的字段，DB 已显式配置的字段优先。
4. 新插件模型第一次同步时创建文档，此后始终复用该 `_id`。
5. 多实例并发依靠唯一索引收敛；重复键后重新读取，不生成第二个 ID。
6. 插件暂时不可用时，不删除或重新编号已有 DB 模型；服务继续从 DB 加载已物化数据。

物化完成后，插件模型只承担“默认模板”职责，数据库文档承担“稳定身份和实际配置”职责。插件新增或删除默认能力不会直接重写管理员配置；若运行时补齐了新字段，应在显式同步时持久化规范化结果，避免同一 DB 版本因插件服务短暂不可用而产生不同运行行为。

### 5.5 唯一索引

当前全局唯一 `{ model: 1 }` 需要替换为仅约束系统模型的部分唯一索引：

```ts
defineIndex(SystemModelSchema, {
  key: { isSystem: 1, model: 1 },
  options: {
    name: 'uniq_system_model',
    unique: true,
    partialFilterExpression: { isSystem: true }
  }
});
```

旧索引必须按仓库规范登记为 deprecated，而不是直接遗漏：

```ts
defineIndex(SystemModelSchema, {
  key: { model: 1 },
  options: { name: 'model_1', unique: true },
  deprecated: true
});
```

未来私有模型 PR 再增加部分唯一索引 `{ tmbId: 1, model: 1 }`，过滤 `isSystem: false` 且 `tmbId` 存在。本轮不提前引入 `tmbId` 和私有模型逻辑。

不能只建立无 partial filter 的 `{ isSystem, model }` 唯一索引，否则所有 `isSystem: false` 的模型仍会在全平台共享一组唯一空间，与未来的“成员内唯一”冲突。

### 5.6 `isSystem` 与 `isCustom`

- 本轮 `system_models` 中的所有模型都属于平台系统模型，包括管理员自行添加、未命中插件模板的模型；创建和迁移统一写入 `isSystem: true`。
- 本轮输入 Schema 应将 `isSystem` 收紧为 literal `true`，不允许管理员 API 写入 `false`。未来私有模型需求再扩展这一边界。
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

所有已经对外发布、且允许调用方选择平台模型的公开 OpenAPI，在兼容期统一接收：

```ts
const ModelReferenceSchema = z
  .object({
    modelId: ObjectIdSchema.optional(),
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

所有已有公开 OpenAPI schema 直接增加 `modelId`，旧 `model` 使用 `.meta({ deprecated: true })`；不复制一套平行 API。非 OpenAPI 接口、内部 RPC 参数和临时 metadata 不承担协议兼容，只声明并接收 `modelId`。

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

- 输入是 ObjectId 形态但不存在时，直接判不存在，不再把它当 `model` 名称查找。
- 兼容分支只能返回 `isSystem: true` 的模型。
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

1. **OpenAPI 请求兼容**：已发布且允许选择模型的 OpenAPI schema 同时接收 `modelId/model`，`model` 标记 deprecated。
2. **统一模型解析兼容**：`getXXModelData` 与 `findModelData` 接收同一个 `ModelReference`；`modelId` 严格优先，仅缺少 `modelId` 时才按系统 `model` 查询。
3. **历史持久化读取**：Dataset、App、Workflow、Evaluation、Usage 和模型权限在迁移窗口内读取旧 `*Model`、workflow key、`resourceName` 或 usage `model`；新写入不得继续产生旧字段。
4. **外部协议归一化**：插件 SDK 的扁平模型只在插件适配入口转换成 canonical `config`；旧 `system_models.metadata` 和旧顶层能力字段只允许升级脚本读取和转换。

除以上白名单外，不保留裸字符串 getter、`string | ModelData`、旧扁平模型与 canonical 模型的运行时 union、把 `config` 再展开到全局缓存或 API DTO 的字段别名，或“已经传入模型对象就直接返回”的旁路。管理员页面、普通客户端和服务端统一使用嵌套 `config`。

## 7. 业务字段迁移

### 7.1 字段分类原则

不是所有 `model` 字段都应改名：

- 模型选择/引用：保留并弃用旧 `model`/`*Model` 字段，同时新增 `modelId`/`*ModelId`。
- provider 请求：继续叫 `model`，值为 `modelData.model`。
- Usage：新记录只保存 `modelId`；历史记录保留原有 `model`，两种结构在查询层兼容。

### 7.2 持久化与 API 字段矩阵

| 数据位置 | 新增字段 | 保留的 deprecated 字段 | 读取优先级 | 新写策略 |
| --- | --- | --- | --- | --- |
| `datasets` | `vectorModelId`、`agentModelId`、`vlmModelId` | `vectorModel`、`agentModel`、`vlmModel` | `*ModelId` 优先 | 只写 `*ModelId` |
| `eval` | `evalModelId` | `evalModel` | `evalModelId` 优先 | 只写 `evalModelId` |
| `apps.chatConfig.questionGuide` | `modelId` | `model` | `modelId` 优先 | 只写 `modelId` |
| `apps.chatConfig.ttsConfig` | `modelId` | `model` | `modelId` 优先 | 只写 `modelId` |
| `apps.modules` / `app_versions.nodes` | 见 Workflow key 表 | 旧 input key | 新 key 优先 | 新节点只写新 key |
| `app_templates.workflow` | 同 Workflow | 旧模板 key | 新 key 优先 | 新模板只写新 key |
| `usage_items` | `modelId` | `model` | 两种记录分别展示 | 新记录只写 `modelId`，不迁移历史记录 |
| 模型权限记录 | `resourceId` | `resourceName` | `resourceId` 优先 | 新记录按 `resourceId`，保留旧名称快照 |

这里的“保留”针对历史持久化数据和公开 OpenAPI 合约，包括对应的 TypeScript 类型、Zod/Mongoose Schema、OpenAPI 字段声明和历史数据读取分支：旧字段改为 optional 并标记 `@deprecated`，本轮不得从这些字段定义中删除。非 OpenAPI 请求参数与内部临时配置不在兼容范围内，只保留 `modelId`。新增 ID 字段不是原字段 rename，也不应通过重建一套 API 实现。

“保留旧字段”不等于新写入继续双写：按已确认的新写规则，新创建的数据只写对应 ID 字段；迁移存量数据时只 `$set` 新 ID sibling，不 `$unset` 旧字段，因此历史值仍然可供兼容读取和回滚。若业务更新采用局部 `$set`，也不得为了清理而主动删除已有 legacy 字段。

### 7.3 Usage 存储与展示

`usage_items` 兼容两种互斥的数据形态：

```ts
// 历史记录
{ model: 'gpt-4o' }

// 新记录
{ modelId: '68ad85a7463006c963799a05' }
```

新写入链只写 `modelId`，不再冗余写 `model`。历史 Usage 不做 modelId 回填，避免为纯展示数据增加大集合迁移成本，也避免把旧名称改成当前展示名。

列表查询按当前分页收集全部 `modelId`，一次批量读取 `system_models` 后生成展示字段，禁止逐条查询：

```ts
const displayModel = usage.model ?? modelMap.get(usage.modelId)?.model ?? i18nT('account_usage:model_unavailable');
```

展示规则：

1. 历史记录存在 `model` 时原样展示，不查询模型、不转换为 `name`。
2. 新记录存在 `modelId` 时展示当前模型文档的 provider `model`，不是展示名 `name`。
3. `modelId` 无法解析时统一展示“模型已下架”，不暴露 ObjectId。
4. “模型已下架”必须补齐中、英、日多语言。
5. Usage 的积分、token 和 amount 在写入时已经确定，列表解析失败不能影响历史计费数据。

### 7.4 Workflow key

工作流协议在保留旧 key 的基础上新增以下 ID key：

| 保留的 deprecated key | 新增 key |
| --- | --- |
| `model` | `modelId` |
| `embeddingModel` | `embeddingModelId` |
| `rerankModel` | `rerankModelId` |
| `datasetSearchExtensionModel` | `datasetSearchExtensionModelId` |
| `datasetDeepSearchModel` | `datasetDeepSearchModelId` |

旧 key 必须继续保留在 Workflow input 常量、类型、Zod Schema、模板反序列化和 Dispatcher 读取分支中，并标记 deprecated；本轮不能通过 rename 或删除旧 input 实现迁移。`datasetParams` 复合对象内的同名字段也遵循相同规则。

运行时解析规则：

1. 新 ID key 存在时只读取新 key，并按 `modelId` 解析；即使 ID 无效，也不能回退同一节点中的旧 key。
2. 新 ID key 不存在时才读取 deprecated key，并按系统模型 `model` 兼容解析。
3. 两套 key 都不存在时，按该节点原有的必填或默认模型语义处理，不能统一静默选择第一个模型。

写入和迁移规则：

- 新建节点和新模板只产生新 ID key，不需要额外双写旧 key。
- 存量节点的旧 key 不删除；当旧 value 是可解析的字面量 `model` 时，通过 `$set`/input append 增加对应 ID sibling。
- Workflow 导入、应用创建以及自动保存/保存版本/发布统一调用 `formatModels`：补充可解析的 ID sibling，并清空当前成员无权使用的静态模型值。
- 编辑或保存存量 Workflow 时保留原本存在的 deprecated input；若用户重新选择了模型，则更新/增加 ID input，但不以“清理”为由删除旧 input。
- 旧字面量无法解析时，不添加 ID sibling，保留旧 input 并在界面显示“模型不存在”。

引用类型 input 的 value 可能来自变量，迁移时无法证明变量运行结果是 ObjectId。此时不能把旧 key 机械复制成新 ID key，只保留 deprecated key，并在运行时把变量结果按旧系统 `model` 解析。只有新 ID key 下的引用值才按 `modelId` 解释；无效时直接报“模型不存在”。

### 7.5 需要覆盖的调用链

- LLM：AI Chat、Agent、问题分类、内容提取、工具调用、上下文压缩、辅助生成、Skill 调试。
- Dataset：向量生成、文本余弦、图片理解、查询扩展、深度搜索、rerank、训练和重建 embedding。
- Audio：站内 TTS/STT 配置与调用。
- Evaluation：创建、执行、重试、列表和用量。
- 模型管理：detail、update、updateWithJson、test、updateDefault 等接口改用 modelId 定位，管理列表返回 modelId。
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

- `MongoResourcePermission` 的模型条目补 `resourceId = modelId`。
- `resourceName` 在兼容期保留，不扩展私有模型所有权语义。
- `getMyModels`、`getMyModel` 和协作者 list/update API 只接收 `modelId`；模型权限历史记录仍兼容读取 `resourceName`。
- FastGPT Pro 中现有模型协作者 API 需要同步修改，否则 available model 过滤仍会按名称失配。
- 不在本轮增加“创建者即所有者”、团队成员 groupId、跨成员私有模型授权等规则。

## 9. 客户端可用模型获取优化

### 9.1 服务端接口

保留管理员 `/core/ai/model/list` 的管理语义，不把账号选择器分页混入管理员管理接口。

将现有 GET `/core/ai/model/getMyModels` 改为当前账号可用模型的分页接口，不额外复制列表路由。请求/响应 contract 移到 `packages/global/openapi/core/ai/model`，复用通用 `PaginationSchema` / `PaginationResponseSchema`：

```ts
export const GetMyModelsQuerySchema = PaginationSchema.extend({
  modelType: ModelTypeSchema.optional(),
  provider: z.string().optional(),
});

export const GetMyModelsResponseSchema =
  PaginationResponseSchema(ClientModelItemSchema).extend({
    providers: z.array(z.string())
  });
```

接口约束：

- 列表业务参数只增加 `provider` 和 `modelType`；分页参数使用通用 `pageNum/pageSize` 或 `offset/pageSize`，不在本轮增加搜索、Channel 和创建者筛选。
- 第一版采用服务端内存逻辑分页：先按现有权限口径得到当前账号可用的 active `modelId` 集合，再从 `global.systemActiveModelList` 过滤出 canonical modelData，应用 `modelType`，生成当前成员在该类型下的去重 `providers`，最后按有效 provider 过滤、稳定排序并分页。无需为了分页把插件配置、权限记录和 Mongo 模型文档做复杂 join。
- `providers` 在应用 provider 过滤前计算，并按 provider order 稳定排序；它只返回 provider ID，客户端使用 `getInitData.modelProviders` 补展示名和头像。这样左侧只展示当前成员、当前 `modelType` 下实际有模型的 Provider。
- 请求未传 `provider` 时语义固定为“不按 Provider 过滤”，`total` 表示当前成员、当前 `modelType` 下的全部模型数量，`list` 是跨 Provider 稳定排序后的分页结果。请求显式传入 provider 时，`total/list` 才表示该 Provider 下的结果；不可用 provider 返回空结果，不能静默切换。
- 选择器首次以 `pageNum=1&pageSize=10` 且不传 provider 发起发现请求。`total <= 10` 时，这一页就是单列选择器的完整候选；`total > 10` 时切换为双列选择器，从响应的 `providers` 中选择当前模型的 Provider，若没有当前值则选第一个 Provider，再发起带 provider 的第一页请求。
- 已有选中值通过 `getMyModel` 恢复，并与发现请求并行。若选中模型的 provider 不在可用 `providers` 中，保留异常 value 并显示“模型不存在”，候选列表使用第一个可用 Provider。
- 不能先对全局模型列表切片再做权限过滤，否则会造成页大小不稳定、total 泄漏和空页。
- 普通分页使用稳定排序，例如 provider order、`name`、`modelId`，保证翻页期间顺序确定；`pageSize` 设置合理上限，建议默认 20、最大 50。
- 移除客户端 `versionKey/isRefreshed` 握手。服务端可以把“成员可用 modelId 集合”按 `{ teamId, tmbId, permissionVersion }` 做短期缓存，并沿用权限 version key 失效；这不会把模型列表缓存责任推给客户端。
- `ClientModelItem` 至少包含 `modelId/type/provider/model/name/avatar/isActive`、默认标记和脱敏后的 `config`，不返回 request auth、URL、默认 system prompt 和请求/存储私有配置。
- 不在本接口夹带 Channel 数量、创建者、resourceContext 或私有模型管理字段。
- Query/Response Schema 必须导出对应类型并补齐 API 声明、字段 meta 和 OpenAPI path。handler 使用 `parseApiInput({ querySchema })` 校验 query，并用 `GetMyModelsResponseSchema.parse(...)` 校验返回值。

分页接口只有 `provider/modelType` 时，无法保证当前已选的 `modelId` 恰好位于已加载页面。因此增加一个鉴权的单模型读取接口 `/core/ai/model/getMyModel`，接收通用 `modelId/model` 引用，先校验当前成员确实可用，再返回一个 `ClientModelItem`。解析仍遵循 modelId 优先、无效 modelId 不回退 model；选择器只用它恢复当前 value，不用它加载候选列表。

### 9.2 客户端状态

- 删除全局 `availableModelList`、五类模型列表、`myModelList.versionKey` 及对应持久化/失效逻辑。客户端不缓存账号完整模型列表，也不在多个选择器之间共享查询结果。
- 每个模型选择器打开时先执行不带 provider 的 10 条发现请求。`total <= 10` 使用单列列表且不展示 Provider；`total > 10` 使用双列列表，并按“当前模型 Provider 优先，否则第一个可用 Provider”请求右侧第一页。点击其他 Provider 时重置到第一页，滚动/翻页只请求当前 Provider 的下一页。`modelType` 改变时重新执行发现请求。关闭或卸载后即可丢弃该选择器的临时分页数据，再次打开重新请求后端。
- 组件仍可持有完成一次交互所需的局部分页状态，但不得写入全局 store、localStorage 或跨选择器 query cache。筛选切换时需取消或忽略过期响应，避免后返回的旧请求覆盖新条件。
- 选择器的 value、权限 Set、默认模型值全部使用 `modelId`，label 继续使用 `name`。
- 当前 value 可能不在第一页：选择器初始化已有值时调用 `/core/ai/model/getMyModel` 恢复选中项，不能通过不断翻页寻找。
- 读取旧业务数据时，单模型接口可用 legacy system `model` 匹配；匹配后增加对应 ID 字段，旧字段按第 7 节规则保留。
- value 非空且单模型接口返回不存在或无权限时，选择框保留该异常值并用红字显示“模型不存在”，不能自动选中第一页模型。
- value 为空的新建场景可以由业务显式选择默认模型；“缺省选择默认值”和“已有值找不到”必须是两个分支。
- 选择器局部维护 `idle/loading/success/error` 和分页结束状态；只能在请求成功后判断“没有可用模型”，不能把加载中或请求失败显示成“模型不存在”。
- 左侧 Provider 列表使用分页响应的 `providers`，并与 `getInitData.modelProviders` 合并展示信息；不能从当前模型页反推 Provider，否则未出现在第一页的 Provider 会永久缺失。

### 9.3 `getInitData`

从 `GetSystemInitDataResponseSchema` 和 `getInitData` 所有响应分支中删除 `activeModelList`。模型相关数据只保留脱敏后的 `defaultModels`，且每个默认模型必须包含 `modelId`；`feConfigs`、套餐、版本、provider 和 AIProxy 渠道等非模型列表初始化数据保持原有职责。

`defaultModels` 表示平台默认配置，不等于当前账号一定有权限。新建业务采用默认值时，模型选择器仍需通过鉴权的 `getMyModel` 确认该模型当前可用；无权限或已停用时显示“模型不存在/不可用”，不能绕过权限直接提交。

新增无需鉴权的 GET `/common/system/getSystemModels`，供 `/price` 页面按需请求全部 active 系统模型的最小公开信息。该接口不分页：完整列表不再进入每个页面都会调用的 init，只在价格页访问时加载；模型数量仍由服务端内存列表提供，不增加数据库查询。

公开响应使用独立 `PublicSystemModelBasicSchema`，只包含：

- `modelId`、`model`、`name`、`provider`、`type`、`avatar`、`testMode`。
- `charsPointsPrice`、`priceTiers`，以及兼容期价格展示需要的 deprecated `inputPrice/outputPrice`。
- `config` 中只保留当前价格表实际展示的能力子集：LLM 的 `maxContext/vision/audio/video/reasoning`，Embedding/Rerank 的 `maxToken`。

不得返回 `requestUrl/requestAuth`、默认 system prompt、`defaultConfig/fieldMap/dbConfig/queryConfig`、voices、默认模型标记、权限信息或其他管理字段。价格页改为给展示组件显式传入这份公开列表，不再从全局模型 store 读取。该常规公共接口需要完整 Zod contract、响应 parse 和 OpenAPI 文档；因为没有入参，不创建空 Query Schema，也不调用空的 `parseApiInput`。

## 10. OpenAPI 与跨仓库改动

- Dataset、Evaluation、辅助 AI API 已有 OpenAPI schema 时直接在原 schema 新增 `*ModelId`；旧 `*Model` 字段继续保留并标记 deprecated，不重复创建第二套评测 OpenAPI。
- `getMyModels` 的分页 query、脱敏 item 和分页 response 在 `packages/global/openapi` 定义并注册现有路由；不继续把 contract 留在 Next.js route 文件中。
- 鉴权的 `getMyModel` 与公开的 `getSystemModels` 分别使用独立最小 Schema，并注册 OpenAPI；不能为了复用直接返回管理员模型详情 DTO。
- 新增或修改的 API 在边界使用 `parseApiInput`，ObjectId 字段复用 `ObjectIdSchema`。
- 模型列表响应的通用业务结构放在 `packages/global/core/ai`，OpenAPI 只组合路由请求和响应。
- FastGPT Pro 至少需要同步 Evaluation 和模型协作者调用方；Pro 的页面布局、渠道页和统计页不随本 PR 进入。
- 外部 OpenAI 兼容接口继续声明 `model`，不要为了内部 modelId 改坏标准协议。
- `cleanSystemModelConfigs` 属于一次性管理员清洗接口，可豁免 OpenAPI 文档，但仍必须使用 `authSystemAdmin`、Zod、`parseApiInput` 和响应 Schema 校验。

## 11. 数据清洗与迁移

### 11.1 单一清洗入口

保留 `admin/dataClean/cleanSystemModelConfigs` 路由，但直接把实现升级为本方案的新清洗逻辑，不保留一套旧 cleaner 再新增平行接口。该接口统一编排：

1. 将 `system_models` 的旧 `metadata`、旧顶层类型字段或已有 `config` 规范化为“扁平业务字段 + 类型化 config”。
2. 给所有现有模型补 `isSystem: true`，并物化缺失的插件模板模型，确保每个模型都有稳定 `_id/modelId`。
3. 建立唯一的系统 `model -> modelId` 映射后，给 Dataset、App/Workflow、Evaluation 和模型权限记录增量补充 ID sibling。
4. Usage 历史记录不回填，只切换新写入链。

接口继续只允许系统管理员执行并支持 `dryRun`，但响应改为按 `models/datasets/apps/evaluations/permissions` 分组的结构化统计；每组至少返回 `scanned/unchanged/wouldUpdate/updated/invalid/unresolved/conflicts` 和有限数量样本。正式执行与 dry-run 必须复用同一套纯转换函数，不能维护两套判断逻辑。

该接口属于一次性管理员清洗能力，可以不注册 OpenAPI path，但不豁免安全和校验：使用 `authSystemAdmin` 鉴权；请求使用 Zod Schema + `parseApiInput`；结构化响应使用 Zod Schema parse；`dryRun` 默认必须为 `true`，只有显式传 `false` 才允许写入。

### 11.2 执行顺序

```text
预检 / dry-run
  -> 清洗 system_models metadata
  -> 历史 system_models 补 isSystem=true
  -> metadata/旧顶层字段拆分为 canonical 顶层字段 + config
  -> 物化全部插件系统模型并稳定 _id
  -> 建立系统 model -> modelId 唯一映射
  -> 创建部分唯一索引并清理 deprecated 全局索引
  -> 回填 datasets
  -> 回填 apps / app_versions / app_templates
  -> 回填 eval
  -> 回填模型 permission.resourceId
  -> 重载服务端模型缓存
  -> 输出复核报告
```

### 11.3 迁移规则

- 全流程分页/游标读取，批量写入，支持大集合。
- 模型结构归一化优先级为 `canonical config > 旧顶层字段 > metadata`；同层冲突记入报告。
- 根据模型 `type` 使用白名单把类型特有字段写入 `config`，未知字段不自动搬运。
- 新代码只写 canonical 顶层字段和 `config`；不再写 `metadata` 或顶层类型特有字段。
- 使用 `$set` 增量补 canonical 字段，不在本轮 `$unset` legacy 字段。
- canonical 已是有效 ObjectId 时不覆盖，保证幂等。
- canonical 与 legacy 同时存在且解析到不同模型时记 conflict，不自动覆盖。
- 旧值无法解析时不写 `*ModelId`，输出 collection、documentId、field、value 供人工处理。
- apps/app_versions 写入使用更新时间或版本快照做 CAS；并发保存导致的 conflict 可通过重跑收敛，不能覆盖用户刚保存的数据。
- 映射只使用系统模型 `model`；发现重复或歧义必须在写业务数据前终止。
- `usage_items` 不参与历史引用回填；仅新写入链开始保存 `modelId`。
- 每一步返回 scanned/migrated/unchanged/unresolved/conflicts；整个接口保持幂等，可以安全重跑，不能依赖上一次请求的进程内状态。

### 11.4 发布兼容边界

本方案是“新代码兼容旧数据”，不是完整双向兼容：

- 旧记录迁移时保留 legacy 字段，因此回滚旧镜像仍能读取这些旧记录。
- 新版本创建的记录只写 modelId，旧镜像无法读取这部分新记录。
- 因此不能在会同时处理写请求的新旧应用实例之间长期滚动混跑；升级需先完成模型物化和预检，再协调切流。
- 如果部署要求新旧实例长期混跑，就必须临时双写 legacy 字段；这与“新保存只有 modelId”的已确认要求冲突，需要另行决策，不能隐式实现。

## 12. 代码改动分区

| 分区 | 主要改动 |
| --- | --- |
| `packages/global/core/ai` | 模型对象增加 `modelId`，定义各类型 config 和客户端脱敏类型 |
| `packages/service/core/ai` | 扁平 schema、config normalize、索引、物化、ID cache、getter、active guard、迁移服务 |
| `packages/global/core/dataset` + `packages/service/core/dataset` | Dataset schema/API/runtime 改 `*ModelId` |
| `packages/global/core/workflow` + `packages/service/core/workflow` | input key、模板、dispatcher、Agent/搜索调用链 |
| `packages/global/core/app` + `packages/service/core/app` | chatConfig、Evaluation、app/appVersion/template 兼容 |
| `packages/service/support/wallet/usage` | usage item 增加 modelId，所有写入链透传 ID |
| `packages/service/support/permission/model` | available model 与权限资源改按 modelId |
| `projects/app/src/pages/api` | 分页可用模型 API、升级后的单一清洗入口和已有 OpenAPI contract 对齐 |
| `projects/app/src/web` / UI | 选择器按需分页请求、selector value、表单默认值和旧数据显示兼容 |
| `pro` | Evaluation、模型协作者接口的最小 modelId 同步 |

实施时应通过类型错误和 `rg` 审计所有调用点，不能直接复用原 PR 的 300+ 文件列表；原列表混入了 Channel、私有模型、管理员统计和页面重构。

## 13. 测试与验收

### 13.1 单元测试

- Schema：系统模型重复 `model` 被拒绝；未来 `isSystem:false` 不受系统 partial index 错误约束。
- Config schema：各模型类型必填/可选字段正确，未知字段和跨类型字段被拒绝。
- Index manager：旧 `model_1` 被精确识别为 deprecated，新 partial unique index 被保留。
- 物化：首次生成 ID、重复同步 ID 不变、多实例重复键收敛、插件失败不删除数据。
- Model reference schema：只传 modelId、只传 deprecated model、两者同时存在时只认 modelId、无效 modelId 加有效 model 仍报错、两者缺失分别覆盖。
- Getter：ID 命中、旧系统 model 命中、私有/未知名称不命中、未知 ObjectId 不回退，所有未命中统一抛“模型不存在”。
- Request types：LLM、Embedding、Rerank、TTS、STT 下游只接受对应 modelData，字符串输入在类型检查阶段失败。
- Client model formatter：敏感字段被删除，默认模型 ID 和 capability 正确。
- 可用模型分页：先权限过滤再分页、稳定排序、pageSize 上限、`modelType` 下 Provider 聚合、未传 provider 返回跨 Provider 总量、显式 provider 过滤、无效 provider 返回空结果和服务端权限缓存失效分别覆盖。
- 单模型读取：当前成员有权/无权、只传 modelId、只传 deprecated model、两者同时存在及无效 modelId 不回退分别覆盖。
- 公开系统模型：无需鉴权、只返回 active 模型和白名单基本/价格/能力字段，所有敏感字段均被剔除。
- Init schema：响应不再包含 `activeModelList`，`defaultModels` 中的模型包含 modelId 且敏感配置被删除。

### 13.2 迁移测试

- datasets、apps、app_versions、app_templates、eval、model permissions 分别覆盖正常、幂等、unresolved、conflict。
- Workflow 字面量旧 input 覆盖“补 ID sibling 且不删除旧 key”；引用型旧 input 覆盖“不机械复制为 ID key”；`datasetParams`、chatConfig 分别覆盖。
- 升级后的 `cleanSystemModelConfigs` 覆盖 dry-run、正式执行、分组统计、invalid/unresolved/conflict 样本和服务端模型缓存重载，并覆盖 metadata/旧顶层/config 三种模型输入及各引用集合。
- 大批量游标执行不会把未解析字符串写入任何 `*ModelId`。

### 13.3 集成测试

- 新建/编辑 Dataset 后数据库只出现 `*ModelId`，训练、搜索和重建 embedding 正常。
- 新建 Workflow 只产生 ID key；编辑或迁移旧 Workflow 增加可解析的 ID sibling 并保留原 deprecated key，旧 Workflow 无需先手工保存即可运行。
- Evaluation 新旧请求均能在兼容期执行，新请求只落 `evalModelId`。
- Prompt 优化、代码优化、问题引导、TTS/STT、Agent Loop 均从 modelId 解析，但 provider 收到正确 `model`。
- 模型能力读取统一来自 `modelData.config`，客户端拿不到 config 中的敏感服务端字段。
- 非法或已删除模型不会调用第一个系统模型；API 统一返回“模型不存在”。
- 模型选择器对不在 available list 的非空 value 显示红色“模型不存在”，不自动改值或选择第一项。
- `getMyModels` 在权限过滤后按 `provider/modelType` 稳定分页；不同选择器不会复用全局模型结果，非第一页的当前值通过 `getMyModel` 恢复。
- 可用模型总数不超过 10 时选择器只发一次发现请求并展示单列；超过 10 时展示 Provider 双列，并按当前模型 Provider 或首个 Provider 加载右侧分页。
- `getInitData` 所有登录/未登录分支都不返回完整模型列表，只返回允许暴露的默认模型；价格页通过公开 `getSystemModels` 获取最小列表。
- Usage 新记录只包含 `modelId`；旧记录原样展示 `model`；新记录批量解析 provider `model`，无法解析时展示“模型已下架”。
- 切换团队/成员后不会短暂显示上一身份的模型列表。
- `/price` 未登录价格展示不回归。

### 13.4 验收条件

- 每个 active 系统模型都有稳定、可重复读取的 modelId。
- 新创建的业务配置不再保存旧 `model` 字符串引用。
- 所有存量可解析引用均完成回填，unresolved/conflict 有明确清单且为 0 后才算迁移完成。
- 旧系统 model 兼容调用可用，未知模型不会静默调用默认模型。
- API 兼容字段 `model` 已标记 deprecated，内部模型请求链不存在字符串 model reference。
- 账号可用模型只通过分页 `getMyModels` 按需获取，客户端不存在账号级完整模型缓存。
- provider/AIProxy 收到的仍是正确 provider model 名。
- PR diff 中不包含 Channel、私有模型 CRUD、管理员统计，也不重复管理员页面迁移；必要的前端改动直接基于 upstream main 当前管理员目录完成。

## 14. 风险与后续清理

- 插件模型未物化会导致部分模型没有 ID，这是本方案的首要上线阻断项。
- new-write-only-ID 使旧镜像不能读取升级后新数据，发布流程必须接受这一限制。
- Workflow 是动态结构，单靠 TypeScript 无法证明无遗漏，必须同时做迁移样本和静态 key 审计。
- config 嵌套会影响当前所有 `modelData.maxContext/vision/...` 调用点，必须通过静态审计确保没有继续读取旧顶层类型字段。
- Usage 列表必须批量解析 modelId，不能形成 N+1；模型缺失时只能影响展示，不能影响历史金额和 token。
- 本轮不删除任何 legacy 模型引用字段。未来是否删除 deprecated 字段、兼容索引和 fallback 必须另行评估存量调用方并单独决策，不能把删除视为本 PR 的默认后续步骤。

## 15. 实施 TODO

- [x] 建立 modelId 基础类型、扁平 `system_models` schema、各类型 config schema 和索引声明。
- [x] 实现插件/旧 metadata/旧顶层字段到 canonical config 的统一 normalize。
- [x] 实现插件系统模型物化，验证 ID 稳定性和并发收敛。
- [x] 重构服务端 ID cache/getter，移除显式未命中时的默认回退。
- [x] 给公开 OpenAPI 的模型选择接口增加 `modelId/model` 兼容 schema，并将 model 标记 deprecated；非 OpenAPI 接口只接收 `modelId`。
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
- [x] 给所有模型选择器增加 legacy value 归一化和红色“模型不存在”状态。
- [x] 直接升级 `cleanSystemModelConfigs` 为结构归一化、模型物化和引用 ID sibling 回填的单一幂等入口，保留 dry-run 和分组统计。
- [x] 补齐局部单测、迁移测试、核心集成测试和 Pro 测试。
- [x] 执行静态残留审计、局部测试、类型检查，最后运行全量测试。
- [ ] 发布前 dry-run，解决全部 unresolved/conflict 后再执行正式迁移与切流。
