# 客户端模型目录与接口收敛设计

状态：已实现并完成验证

最后核对：2026-08-30

关联设计：[模型引用统一为 modelId](./model-id-reference-migration.md)

## 1. 背景

modelId 迁移完成后，客户端仍同时存在以下模型数据链路：

- `getInitData` 返回 Provider 和默认模型。
- `getMyModels` 分页返回成员可用模型。
- `getMyModel` 恢复分页之外的当前模型。
- `useSystemModelLists` 在多个页面和 Workflow 节点中重复拉取完整模型列表。
- `AIModelSelector` 自行分页、恢复当前值和维护 Provider 状态。
- 管理员模型管理、团队模型权限管理和价格页使用与业务选择器不同的模型视图。

这些接口使用不同的缓存、权限和 Schema，却共享相近命名，导致调用方必须理解分页、权限、Provider、默认模型和 legacy modelId 兼容的组合规则。本设计将普通成员使用的模型信息收敛为一个深模块：**客户端模型目录**。

## 2. 已确认决策

1. 普通成员一次获取完整、脱敏、权限过滤后的 active 模型目录，不分页。
2. 普通客户端不再提供单模型 detail；模型选择器、maxToken 和能力判断都读取本地目录。
3. Provider、当前成员有效默认模型和用户可用模型由同一个 `useUserModelStore` 管理并持久化。
4. `getInitData` 不再返回模型、Provider 或默认模型；模型域更新不再修改 `getInitData.bufferId`。
5. 普通成员模型目录使用独立 version。version 未变化时接口不返回完整目录。
6. 本地模型缓存只按 `{ teamId, tmbId }` 隔离，不使用 userId。
7. 只有真正重新登录成功时删除全部本地模型缓存并强制重新拉取；退出登录只清内存状态，不删除持久化缓存。
8. 管理员模型管理使用 `/admin/settings/model/*` 独立接口，不进入 `useUserModelStore`，不做成员权限过滤。
9. 管理员页面的可用模型候选从管理员 list 在客户端按 active、type 和 capability 过滤，保存时后端再次校验。
10. 公开价格模型与普通用户模型接口都放在 `/core/ai/model/*`，但使用独立路由、鉴权和 Schema。
11. 价格页模型列表和管理员 list/detail 不做本地模型目录缓存。
12. 团队模型权限管理是第四种独立视图，不能使用当前成员权限过滤后的模型目录。
13. 模型目录按需加载：root 登录后单独检查系统是否已配置模型，普通成员只在出现模型消费者时校验目录；同时发生的同身份请求复用一个 in-flight Promise，不做页面级请求拦截。
14. 工作流外链中的模型选择器使用 `shareId/outLinkUid` 鉴权。服务端从发布链接解析 `{ teamId, tmbId }` 后计算成员权限，客户端不得直接指定成员身份。
15. **已确认的临时权限边界**：模型协作者权限只过滤客户端 catalog 和选择器候选，不是保存、发布或运行时的服务端授权边界；服务端暂时只校验模型 ID 是否存在、启用且类型匹配。已知 active modelId 即使不在当前成员 catalog 中也不会因模型协作者权限被拒绝，后端权限校验留给后续独立需求，评审本版本时不得把这一已确认决策误判为漏实现。

## 3. 目标与非目标

### 3.1 目标

- 普通客户端只有一个模型目录数据源。
- 模型选择器变成纯本地筛选和选择模块，不自行请求模型。
- Provider、模型配置和默认模型使用同一 version 和同一本地缓存生命周期。
- 复用后端已有系统模型运行时缓存和成员可用 modelIds 缓存。
- 管理员配置值与普通成员实际可用默认值严格区分。
- 接口路径、鉴权和 Schema 与使用场景一致。
- 删除 `useSystemModelLists`、分页选择器状态和普通客户端单模型详情链路。

### 3.2 非目标

- 不为管理员模型页面和价格页增加持久化缓存。
- 不把团队权限管理并入系统管理员模型配置。
- 不在本版本新增保存、发布和运行时的模型协作者权限校验；客户端 catalog 过滤只约束可见和可选范围，不构成服务端授权。
- 不把服务端完整模型文档或敏感请求配置返回普通客户端。
- 不保留旧模型接口的兼容转发文件；全部调用迁移后直接删除旧路由。

## 4. 领域数据形态

### 4.1 客户端模型

普通成员接口返回独立的客户端安全模型 Schema。它对客户端功能完整，但不是服务端模型文档的脱敏副本：

```ts
type ClientModel = {
  modelId: string;
  model: string;
  name: string;
  provider: string;
  type: ModelTypeEnum;
  testMode?: boolean;
  config: ClientSafeModelConfig;
  pricing?: ClientModelPricing;
};
```

约束：

- `modelId` 是客户端查找、选择和保存的唯一权威标识。
- `model` 只用于 legacy 数据兼容和 Provider 调用标识，不建立第二套客户端权威索引。
- `config` 只包含客户端实际使用的 maxContext、maxResponse、quoteMaxToken、maxToken、vision、audio、video、reasoning、voices 等字段。
- 密钥、渠道配置、服务端请求映射、数据库配置、内部默认请求体、内部系统 Prompt 等字段不得返回。
- Schema 必须显式白名单定义，不能直接对服务端模型对象做不完整的字段删除。

### 4.2 客户端 Provider

Provider 返回原始多语言展示信息，避免切换语言时重新下载整个目录：

```ts
type ClientModelProvider = {
  id: string;
  order: number;
  avatar?: string;
  name: {
    'zh-CN': string;
    'zh-Hant': string;
    en: string;
  };
};
```

模型只保存 Provider ID。Provider 名称、图标和顺序由 `useUserModelStore` 本地映射。Provider 配置变化属于模型目录变化，不再属于 getInitData 变化。

### 4.3 默认模型

默认模型分为两个不同概念：

```ts
type ConfiguredDefaultModelIds = {
  llmModelId?: string;
  embeddingModelId?: string;
  rerankModelId?: string;
  ttsModelId?: string;
  sttModelId?: string;
  datasetTextLLMModelId?: string;
  datasetImageLLMModelId?: string;
  chatTitleLLMModelId?: string;
};

type EffectiveDefaultModelIds = {
  llm?: string;
  embedding?: string;
  rerank?: string;
  tts?: string;
  stt?: string;
  datasetTextLLM?: string;
  datasetImageLLM?: string;
  chatTitleLLM?: string;
};
```

- `ConfiguredDefaultModelIds` 是管理员精确配置，不按成员权限过滤。
- `EffectiveDefaultModelIds` 是普通成员实际可使用的默认模型，由管理员配置和当前成员可用模型共同计算。
- 普通成员目录只返回 effective 值；管理员 list 返回 configured 值。
- configured 值保存在独立 `ai_default_models` 集合；记录包含 `scope` 和 `defaultModelIds`。system scope 通过唯一索引限制为一条，team scope 预留 `teamId` 并限制每个团队一条。
- 首次 `system_models -> ai_models` 启动迁移会在同一事务把旧 `isDefault*` 标记转换为 system scope 默认配置；运行时不再读取模型布尔字段或 `system_configs`。

## 5. 接口设计

### 5.1 普通成员模型目录

```text
GET /core/ai/model/catalog?version=<client-version>
```

鉴权与数据范围：

- 支持登录态和工作流外链两种互斥身份。
- 登录态按当前 `{ teamId, tmbId }` 计算成员有效模型权限。
- 外链只接收 `shareId/outLinkUid`，先校验发布链接并从服务端配置取得 `{ teamId, tmbId }`，再计算该成员的有效模型权限。
- 只返回 active 且当前成员可用的模型。
- root 和团队 owner 按既有权限规则获得全部 active 系统模型。

version 未变化时：

```ts
{
  version: string;
}
```

version 变化或请求未携带 version 时：

```ts
{
  version: string;
  providers: ClientModelProvider[];
  defaultModelIds: EffectiveDefaultModelIds;
  models: ClientModel[];
}
```

`models` 不分页。响应必须经过 `GetModelCatalogResponseSchema` 校验。

### 5.2 公开价格模型列表

```text
GET /core/ai/model/list
```

约束：

- 无需登录，不做成员权限过滤。
- 只返回 active 模型。
- 不进入 `useUserModelStore`，不使用普通成员目录 version。
- 返回价格页需要的模型名称、Provider 展示、公开能力和价格字段。
- 使用独立的公开 Schema，不返回普通客户端运行配置或管理员配置。
- 当前方案不分页、不做本地持久化缓存；未来只有实际规模证明需要时再增加分页。

### 5.3 系统管理员模型接口

统一放在：

```text
GET    /admin/settings/model/list
GET    /admin/settings/model/detail
GET    /admin/settings/model/getDefaultConfig
GET    /admin/settings/model/getConfigJson
GET    /admin/settings/model/test
POST   /admin/settings/model/create
PUT    /admin/settings/model/update
DELETE /admin/settings/model/delete
PUT    /admin/settings/model/updateDefault
PUT    /admin/settings/model/updateWithJson
```

管理员 list 一次返回管理首页和默认模型弹窗所需数据：

```ts
{
  models: AdminModelListItem[];
  providers: AdminModelProvider[];
  defaultModelIds: ConfiguredDefaultModelIds;
}
```

管理员接口约束：

- 使用系统管理员鉴权。
- 返回 active 和 inactive 系统模型，不做成员权限过滤。
- 管理员 list 返回管理和筛选需要的摘要；detail 在打开编辑时返回完整可编辑配置。
- 默认模型候选由客户端从管理员 list 按 active、type 和 capability 过滤。
- `updateDefault` 必须在后端重新校验 modelId、scope、active、type 和 vision 等能力。
- 管理员接口不进入 `useUserModelStore`，不修改 getInitData bufferId。

### 5.4 团队模型权限接口

团队权限管理继续使用权限域接口，例如：

```text
/proApi/system/model/collaborator/list
/proApi/system/model/collaborator/update
```

它返回全部可授权的 active 系统模型及协作者配置，不能使用当前成员已经过权限过滤的普通模型目录。权限写入成功后清理对应团队的 MyModels 后端缓存。

## 6. getInitData 收敛

从所有登录和未登录响应分支中删除：

```text
modelList
modelProviders
defaultModels
```

getInitData 只保留 feConfigs、systemVersion、subPlans、aiproxyChannels 等非模型初始化数据。以下变化不得再修改 `global.systemInitBufferId`：

- 模型新增、更新、删除、启用或停用。
- Provider 名称、图标、顺序或多语言信息变化。
- 管理员默认模型变化。
- 模型权限变化。

## 7. 后端缓存与 version

### 7.1 复用现有缓存

继续复用：

```text
global.systemModelList
global.systemActiveModelList
global.systemModelMap
global.systemDefaultModel
```

成员权限继续使用 `TmpDataEnum.MyModels`，数据扩展为：

```ts
{
  teamId: string;
  tmbId: string;
  modelIds: string[];
  version: string;
}
```

不增加一份完整成员模型列表后端缓存。接口只组合成员 modelIds 与进程内 canonical 模型缓存。

### 7.2 权限 version

`tmpData._id` 不能作为 version：updateOne 和过期文档原地更新都会保留 `_id`，owner 和开源版路径也可能没有 tmpData。

生成 MyModels 缓存时计算：

```ts
const permissionVersion = hash([...modelIds].sort().join(','));
```

该 version 与 modelIds 同时写入 tmpData。模型权限、组织、用户组、团队成员和角色变更必须继续清理对应团队缓存；active 模型集合变化清理全部成员缓存。

### 7.3 系统模型目录 version

模型和 Provider 加载成功时计算一次，不在每个目录请求中重新 stringify 完整列表：

```ts
global.clientModelCatalogVersion = hash(
  stableStringify({
    schemaVersion: CLIENT_MODEL_CATALOG_SCHEMA_VERSION,
    providers,
    activeClientModels,
    configuredDefaultModelIds
  })
);
```

最终成员 version：

```ts
const version = [
  CLIENT_MODEL_CATALOG_SCHEMA_VERSION,
  global.clientModelCatalogVersion,
  permissionVersion
].join(':');
```

普通请求只读取已有子版本并比较字符串。version 不同时才组装并返回完整目录。无关模型变化可能使某个成员多下载一次目录，这是为降低失效复杂度而接受的保守失效。

## 8. 有效默认模型计算

普通成员目录按以下规则生成 effective 默认值：

1. 管理员配置模型 active 且在成员可用 modelIds 中时使用该 ID。
2. 普通类型默认模型不可用时，回退成员第一个同类型 active 模型。
3. datasetTextLLM 不可用时，回退成员第一个 LLM。
4. datasetImageLLM 不可用时，回退成员第一个支持 vision 的 LLM。
5. 没有符合条件的候选时返回 `undefined`。
6. chatTitleLLM 是明确可关闭功能：管理员未配置或配置失效时保持 `undefined`，不自动开启其他模型。

默认模型本质是“用途到 modelId 的映射”，不是模型自身属性。新结构集中保存 ConfiguredDefaultModelIds，不再以分散的 `isDefault`、`isDefaultDatasetTextModel`、`isDefaultDatasetImageModel`、`isDefaultChatTitleModel` 作为权威配置。

管理员配置引用失效模型时保留原始 ID，在管理员页面显示失效；普通成员目录仍按上述规则返回可用 fallback，不能偷偷改写管理员配置。

## 9. useUserModelStore 与本地缓存

### 9.1 Store 职责

```ts
type UserModelStore = {
  identity?: string;
  version?: string;
  providers: ClientModelProvider[];
  providerMap: Record<string, ClientModelProvider>;
  modelList: ClientModel[];
  modelMap: Record<string, ClientModel>;
  defaultModelIds: EffectiveDefaultModelIds;
  loading: boolean;
  loaded: boolean;
  syncCatalog: (
    identity:
      | { teamId: string; tmbId: string }
      | { outLinkAuthData: { shareId: string; outLinkUid: string } }
  ) => Promise<void>;
  refreshCatalog: () => Promise<void>;
  clearCatalog: () => void;
  getModel: (modelId?: string) => ClientModel | undefined;
  getProvider: (providerId?: string) => ClientModelProvider | undefined;
  getDefaultModelId: (purpose: ModelPurpose) => string | undefined;
};
```

Store 是普通客户端模型目录的唯一 Interface。调用方不再自行发模型请求、维护 Provider map 或实现默认模型 fallback。

### 9.2 持久化身份

本地缓存 key：

```text
fastgpt:model-catalog:v1:<teamId>:<tmbId>
```

- 不使用 userId。
- `v1` 是本地缓存 Schema 版本。
- 浏览器存储天然按部署域名隔离。
- 持久化 providers、modelList、defaultModelIds 和 version。
- 不持久化 loading、error、Promise、Map 或选择器交互状态；Map 在 hydration 后重建。
- 外链目录只在当前页面内存中复用，不写入持久缓存；鉴权失败时清空该外链的内存目录。

### 9.3 生命周期

页面刷新或已有会话恢复：

```text
恢复当前 teamId/tmbId 缓存
→ 用缓存先渲染
→ 携带 version 校验 catalog
→ 相同则继续使用
→ 不同则原子替换完整目录
```

退出登录：

- 清空 `useUserModelStore` 内存状态，防止退出页继续展示模型数据。
- 不删除持久化模型目录缓存。
- 主动登出开始后，到下一次登录成功前，并发请求产生的凭证错误按已处理错误收敛，不再重复清 Token、跳转或弹出“凭证过期”；自然会话失效仍走正常鉴权错误流程。

真正重新登录成功：

- 删除全部 `fastgpt:model-catalog:*` 持久化项。
- 清空 Store 内存。
- 不携带旧 version，强制拉取当前 `{ teamId, tmbId }` 完整目录。

重新登录不包括页面刷新后的 session 恢复、用户信息 hydration 或 token 自动续期。切换团队不删除其他目录，按新的 `{ teamId, tmbId }` 恢复并校验。

模型消费者加载：

- 普通成员页面不在 Layout 预加载目录，模型选择器或其他模型消费者挂载时才校验。
- 每个模型消费者挂载时都会发起 version 校验；同一身份的并发校验由 Store 复用第一个 in-flight Promise，请求结束后不再保留拦截记录。
- root 的系统未配置检查使用管理员模型接口，只在登录代次内执行一次，不加载普通成员目录。
- 外链模型消费者使用 `outlink:<shareId>` 作为页面内存身份；请求仍必须携带当前 `outLinkUid` 完成服务端校验。

## 10. 客户端调用收敛

### 10.1 模型选择器

AIModelSelector 通过统一 loader 校验目录并读取 Store；同时挂载的多个选择器共享正在进行的请求。目录就绪后在本地完成：

- 按 type 和 capability 过滤。
- 按 Provider 分组和排序。
- 本地搜索。
- 展示当前 modelId 对应模型。
- 输出 modelId。
- 业务表单可显式启用“空值自动选择默认模型”；只从当前候选范围选择 effective default，不在范围内时回退第一个候选，且绝不覆盖非空的历史失效值。

调用方不再传完整 list 白名单，改为声明能力条件：

```tsx
<AIModelSelector
  modelType={ModelTypeEnum.llm}
  capabilities={['vision']}
  value={modelId}
  onChange={setModelId}
/>
```

### 10.2 Workflow 与业务表单

- maxToken、quoteMaxToken、能力和名称统一通过 `getModel(modelId)` 获取。
- Workflow 初始化、快照、复制粘贴和节点校验统一按 modelId。
- reference、数组引用和模板表达式不做客户端静态有效性校验。
- 服务端保存、发布和运行时继续校验模型是否存在、启用且类型匹配，但本版本明确不校验当前成员的模型协作者权限。
- catalog 的成员权限过滤用于限制客户端可见和可选范围，不是服务端授权依据；补充后端模型权限属于后续独立需求，不能在本次 modelId 迁移中隐式加入。

### 10.3 系统模型健康判断

- 普通成员只能判断“当前账号是否有可用模型”，不能断言“系统未配置模型”。空目录也可能由权限导致。
- root 登录后通过管理员模型 list 检查是否存在 active LLM/Embedding，同一登录代次只执行一次。
- root 缺少必要 active 类型时提示并跳转管理员模型页面。
- 普通成员不执行系统模型健康判断；其模型消费者只处理当前成员目录为空的状态。

## 11. 路由迁移

删除并迁移：

| 旧接口 | 新接口 |
| --- | --- |
| `/core/ai/model/getMyModels` | `/core/ai/model/catalog` |
| `/core/ai/model/getMyModel` | 删除，由本地完整目录替代 |
| `/core/ai/model/getSystemModels` | `/core/ai/model/list` |

管理员读取、写入、导入导出、测试和默认模型更新全部位于 `/admin/settings/model/*`。迁移所有客户端调用和 OpenAPI 声明后删除旧路由，不创建兼容转发文件。

## 12. 测试与验收

### 12.1 后端

- catalog 鉴权、active 过滤、root/owner 和普通成员权限分别覆盖。
- catalog 外链鉴权只采用发布配置中的 teamId/tmbId，不接受客户端伪造成员身份。
- version 相同时只返回 version；未传或不同时返回完整目录。
- Provider、客户端模型字段、默认模型或成员 modelIds 变化都会改变最终 version。
- tmpData 原地更新、过期未删除和 owner/开源路径均不依赖 `_id`。
- ClientModel Schema 证明敏感字段不会返回。
- effective 默认模型覆盖命中、无权限、inactive、同类型 fallback、vision fallback、无候选和 chatTitle 不回退。
- 管理员 list/detail/default update 的鉴权、类型、active、vision 和失效配置展示分别覆盖。
- 公开 list 无需登录、无成员权限过滤且只返回公开字段。

### 12.2 客户端

- 页面刷新命中本地缓存并完成 version 校验。
- 同时挂载的多个模型消费者只发起一次 version 校验；首个请求完成后新挂载的消费者会再次校验。
- 工作流外链仅在出现模型选择输入时加载目录，且外链目录不持久化、鉴权失败后不展示旧内存目录。
- 退出登录只清内存；真正重新登录清理全部模型目录缓存并强制全量请求。
- 主动退出期间的并发凭证错误不弹 Toast；登录成功后必须解除该保护，后续真实会话失效仍可被识别。
- teamId 或 tmbId 变化不会短暂展示上一身份目录。
- Provider 多语言切换不请求新目录。
- 选择器按 type、Provider 和 capability 本地过滤，只写 modelId。
- Workflow 和 Dataset 等调用方不再自行请求或保存完整模型列表。
- root 健康检查只使用管理员模型接口；普通成员不执行系统模型健康检查。
- 管理员页面与价格页不读写 `useUserModelStore`。

### 12.3 验收条件

- `getInitData` 响应和 bufferId 生命周期不包含任何模型域数据。
- 普通客户端不存在分页模型请求和单模型 detail 请求。
- `useSystemModelLists` 已删除，普通业务模型数据只来自 `useUserModelStore`。
- 当前成员完整目录只在 version 变化或重新登录后重新下载。
- 管理员、普通成员、团队权限和价格页四种模型视图的路由、鉴权和 Schema 互不复用错误语义。
- 所有新业务写入仍只保存 modelId。

## 13. 实施 TODO

- [x] 定义 ClientModel、ClientModelProvider、catalog、effective/configured defaults 和公开价格 Schema。
- [x] 将默认模型权威配置从模型布尔标记迁移到 `ai_default_models` 的作用域 modelId 映射，并在模型启动迁移事务中同步接管旧默认标记。
- [x] 在系统模型/Provider 加载完成后计算 `clientModelCatalogVersion`，默认和 Provider 更新不再修改 getInitData bufferId。
- [x] 扩展 MyModels tmpData 保存排序后 modelIds 的 permissionVersion，并复用既有权限缓存失效入口。
- [x] 实现 `/core/ai/model/catalog` 的条件响应、权限过滤、effective defaults 和客户端安全投影。
- [x] 实现公开 `/core/ai/model/list` 并迁移价格页。
- [x] 收敛 `/admin/settings/model/*` 的管理数据读取、默认模型更新及现有写接口客户端调用。
- [x] 从 getInitData Schema、所有响应分支和 useSystemStore 删除 Provider 与默认模型。
- [x] 实现 useUserModelStore、`{ teamId, tmbId }` 本地持久化、version 校验和重新登录清理。
- [x] 将 AIModelSelector 改为纯本地目录选择器，删除分页和单模型恢复；现有特殊能力子集暂以限制列表兼容，后续可单独收敛为 capability 参数。
- [x] 迁移 Workflow、Dataset、Chat、Evaluation、Prompt、TTS/STT 等客户端模型读取到 useUserModelStore。
- [x] 删除 useSystemModelLists、getMyModels、getMyModel、getSystemModels 路由及无引用的分页工具和测试。
- [x] 补齐 catalog、公开列表、默认回退、权限版本、管理员默认更新和 Store 缓存核心测试。
- [x] 增加 catalog 外链鉴权模式，并让 workflow tool 分享页的模型选择输入按需复用目录请求。
- [x] 外链 in-flight 请求按当前 `outLinkUid` 区分代次，凭证变化时废弃旧响应。
- [x] 明确记录模型协作者权限暂时只约束客户端目录，后端保存、发布和运行链不直接鉴权。
- [x] 为猜你想问和模型评测启用空值默认模型回填，移除硬编码模型并兼容目录异步加载。
- [x] 收敛主动登出期间的并发凭证错误，并在下一次登录成功时恢复正常鉴权错误处理。
- [x] 执行最终全量测试并记录结果。

验证结果：`app`、`global`、`service`、`web` workspace 全量测试通过；`admin` 全量测试中一个既有账单用例因 MongoDB 集合锁超时失败，单独复跑该文件后 4 个用例全部通过。
