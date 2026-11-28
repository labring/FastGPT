# 代码规范

本文档约束新增或修改的业务代码；存量代码在修改相关模块时渐进对齐，不借无关 PR 批量重构。方案取舍见[工程设计原则与质量把控](./design-principles.md)。

## 模块边界与目录分层

采用 DDD 分层架构与领域仓储边界，跨实例协作遵循依赖倒置：下层不感知上层，同层实例互不引用，所需其他实例能力由上层以函数参数注入。

### 分层架构

「实例」指拥有独立持久化 Schema 的业务对象（如 App、AppVersion、Dataset、Chat）；没有独立 Schema、只为拆分文件而建的子目录与上级属于同一实例。

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 1. 共享原子层 | `packages/global/core/<域>/type.ts`、`constants.ts` | 前后端共享的类型、常量与业务 Zod Schema（browser-safe） |
| 2. 领域仓储层（DAL） | `packages/dal/db/repos/<域>/**`（存量过渡：`schema.ts`、`entity.ts`） | 单表/子域持久化契约、方言实现、归一化读写与索引声明 |
| 3. 实例业务层 | `packages/service/core/<域>/service.ts`、`utils.ts` | 承载本实例业务规则；`utils.ts` 为无副作用纯函数 |
| 4. 业务编排层 | `orchestration.ts`（单应用私有放 `projects/*/src/service/<域>/`） | 组合多个实例业务层、开启事务并注入依赖；单实例用例不创建 |
| 5. API 层 | `projects/*/src/pages/api/**`，契约在 `packages/global/openapi/**` | 鉴权、入参校验与出参组装，调用编排层或单个实例业务层 |

分层与文件纯度约束：

- **单向依赖**：只能向下依赖，禁止反向依赖上层；原子层与实例业务层禁止 import 其他实例的 `schema.ts`、`entity.ts`、`service.ts`。
- **操作函数注入**：跨实例依赖优先传操作函数，不传其他实例的模块对象、Model 或整个 service；函数签名由使用方在本实例用 `type` 声明最小契约，不用 `typeof` 引用其他实例实现。单实例用例由 API 层直接调实例业务层，不新增纯透传编排函数。
- **鉴权与事务归属**：`auth.ts` 仅由 API 层或编排层入口调用，实例业务层接收已确认的 `teamId`、`tmbId` 等可信参数；事务由发起组合的层通过 `runInTransaction` 开启并逐层显式传入 `tx?: DbSession`（见[数据写操作支持可选 `tx?: DbSession` 显式事务参数](#数据写操作支持可选-tx-dbsession-显式事务参数)）。
- **包与持久化隔离**：`global/core/` 禁止引入 `mongoose`、`kysely`、`pg`、`mysql2`、服务端 SDK，严禁声明物理表名/集合名，实体 ID 统一用 `@fastgpt/global/common/string/entityId`；`service/core/` 禁止被 `packages/web/` 或前端页面直接引用；除 `**/mongo/**`、`**/oceanbase/**` 与 `packages/dal/db/**` 外，业务与 API 代码严禁直接引用数据库驱动或裸 `MongoXxx` Model。
- **文件职责纯度**：`type.ts` 仅放类型声明与对应 Zod Schema，不塞入业务解析或通用工具函数；`utils.ts` 纯函数禁止原地修改（mutate）调用方传入的对象或数组；仅用于单次迁移的过渡 Schema 留在迁移目录，不污染 `packages/global`；不新增 `controller.ts`（存量按职责渐进迁入上述各层）。

### 目录结构

按业务域 → 子功能 → 固定文件组织，子功能目录不超过 **3 层**嵌套；同子域紧密关联的多张子表 Schema 合并置于同一 `mongo/schema.ts` 与 `oceanbase/table.ts`。

```
packages/
├── global/core/              # 共享原子层：类型、常量、业务 Schema（browser-safe）
│   └── app/
│       ├── type.ts           # 顶层聚合类型与 Schema
│       ├── constants.ts
│       └── version/type.ts
│
├── dal/db/repos/             # 纯服务端持久化与仓储边界（Pro 表位于 pro/admin/src/dal/db/repos/）
│   └── app/
│       ├── repo.type.ts      # 【公开导出】仓储契约 type、严进 Write / 宽出 Read Schema 及 .pick() 窄 DTO
│       ├── repo.ts           # 【公开导出】defineRepoToken 导出 AppRepoToken（模块加载期零副作用）
│       ├── mongo/            # 【包内私有，package.json exports 不暴露】
│       │   ├── schema.ts     # 原生 new Schema + defineMongoCollection（含集合名与索引）
│       │   └── repo.ts       # extends MongoRepositoryBase，封闭 .lean() / ObjectId / 租户过滤，出口走 parseRow/parseList
│       └── oceanbase/        # 【包内私有，package.json exports 不暴露】
│           ├── table.ts      # 行类型、表名常量与原生 CREATE TABLE DDL（utf8mb4_bin + fg_ 索引）
│           └── repo.ts       # extends OceanBaseRepositoryBase，implements AppRepository
│
└── service/core/             # 后端业务逻辑与编排（新代码消费 @fastgpt/dal 公开 Token 与 repo.type）
    └── app/
        ├── service.ts        # AppService 类（构造函数 deps 注入仓储与协同函数）+ 导出单例
        ├── orchestration.ts  # 跨实例编排（如有）
        ├── auth.ts           # 资源鉴权（如有）
        └── utils.ts          # 无副作用纯函数工具
```

> 架构设计详见 [多数据库适配与领域仓储重构设计](../design/common/dal/multi-db-repository-architecture.md)。新增与重构持久化模块一律采用上述领域仓储结构（`repo.type.ts` 严禁泄漏 `FilterQuery`、空格投影字符串等驱动类型；日志类仓储未配置 `logWriteUrl` 时透明回退复用主池）。

```typescript
// packages/dal/db/repos/app/repo.ts —— 注册方言工厂，模块加载期零副作用
export const AppRepoToken = defineRepoToken<AppRepository>('AppRepository', {
  mongo: (runtime) => new MongoAppRepository(runtime),
  oceanbase: (runtime) => new OceanBaseAppRepository(runtime)
});

// service.ts —— 构造函数依赖注入（单测直接 new AppService({ appRepo: mockRepo }) 零 vi.mock 隔离）
export type AppServiceDeps = {
  appRepo?: AppRepository;
  versionRepo?: AppVersionRepository;
};

export class AppService {
  private readonly appRepo: AppRepository;
  private readonly versionRepo: AppVersionRepository;

  constructor(deps: AppServiceDeps = {}) {
    this.appRepo = deps.appRepo ?? injectRepo(AppRepoToken);
    this.versionRepo = deps.versionRepo ?? injectRepo(AppVersionRepoToken);
  }

  async findAppById(appId: string, teamId: string) {
    return this.appRepo.findActiveById({ appId, teamId });
  }
}

export const appService = new AppService();
```

### 跨实例依赖通过函数注入

```typescript
// ❌ 不好的实践：App 实例业务层直接引入 Chat、AppVersion 实例
import { deleteChatsByAppId } from '../chat/service';
import { MongoAppVersion } from './version/schema';

export const deleteApp = async (appId: string, tx?: DbSession) => {
  await deleteChatsByAppId({ appId, tx });
  await MongoAppVersion.deleteMany({ appId });
  await deleteAppById(appId, tx);
};

// ✅ 好的实践
// app/service.ts —— 实例业务层：在本实例声明所需的函数契约，由上层注入
type CleanupAppRelationsFn = (params: { appId: string; tx: DbSession }) => Promise<void>;

export const deleteApp = async (props: {
  appId: string;
  tx: DbSession;
  cleanupRelations: CleanupAppRelationsFn[];
}) => {
  const { appId, tx, cleanupRelations } = props;

  // 1. 先清理关联数据，再删除 App 本身，避免残留孤儿数据。
  for (const cleanup of cleanupRelations) {
    await cleanup({ appId, tx });
  }

  // 2. 删除 App 主记录。
  await deleteAppById({ appId, tx });
};

// app/orchestration.ts —— 业务编排层：组合多个实例业务层，开启事务并注入依赖
export const deleteAppWithRelations = (appId: string) =>
  runInTransaction((tx) =>
    deleteApp({
      appId,
      tx,
      cleanupRelations: [deleteChatsByAppId, deleteVersionsByAppId]
    })
  );

// pages/api/core/app/del.ts —— API 层：鉴权、校验入参后调用编排层
const { appId } = parseApiInput({ req, query: DeleteAppQuerySchema });
await authApp({ req, appId, per: OwnerPermissionVal });
await deleteAppWithRelations(appId);
```

注入函数同时是测试接缝：实例业务层单测直接传入 fake 函数，无需 mock 其他实例模块。

### 禁止 re-export

禁止使用 `export { ... } from '...'`、`export type { ... } from '...'` 或 `export * from '...'` 转导其他模块的成员，包括 `index.ts` barrel、目录聚合入口和兼容旧路径的转发文件。

- 每个导出只能由其实际定义文件提供，使用方直接从定义模块导入。
- `index.ts` 可以包含自身的实现和定义，但不能聚合导出其他文件。
- 移动定义时直接修改全部使用方的 import，确认旧路径无引用后删除旧文件；不为缩短路径、隐藏目录或兼容旧路径新增转导层。

```typescript
// ❌ 不好的实践：通过目录入口转导其他模块
export { createLLMResponse } from './createLLMResponse';
export type { LLMResponse } from './type';
export * from './constants';

// ✅ 好的实践：使用方直接引用成员的定义模块
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/createLLMResponse';
import type { LLMResponse } from '@fastgpt/global/core/ai/llm/type';
```

## 契约、类型与兼容

坚持契约单一事实源：**一次定义 → 跨层复用 → 边界收窄 → 兼容演进**。

### 类型声明与契约单一来源

- **使用 `type`，不使用 `interface`**。
- **Zod Schema 同时承担校验与类型，并跨层直接复用**：用 `z.infer` 从 Schema 推导类型；前端 API 客户端、服务层、CLI 与测试直接复用已导出的共享 Schema、`z.infer` 类型与公共校验器，禁止手写同构类型、重复枚举映射或重命名 alias（`export const A = B`）。仅当表单内部状态与传输契约确实不同构时，才独立定义表单类型。
- **区分 `z.input` 与 `z.infer`**：含 `transform`、`default`、`catch` 或容错数值转换的 Schema，输入与输出类型不同。调用方入参、客户端请求参数用 `z.input<typeof Schema>`，解析后的结果用 `z.infer<typeof Schema>`；不手写目标类型，也不用 `as any` 把两者桥接起来。

```typescript
// ❌ 不好的实践：重复手写与 Schema 同构的传输类型
interface MessageParam {
  role: 'user' | 'assistant';
  content: string;
}
const MessageParamSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string() });

// ✅ 好的实践：Schema 单一来源推导类型，客户端与服务端直接复用
export const MessageParamSchema = z.discriminatedUnion('role', [...]);
export type MessageParam = z.infer<typeof MessageParamSchema>;
```

### 类型守卫与 `unknown` 收窄

- **边界值先校验再收窄**：外部输入、JSON/文件载荷、上游 HTTP 2xx 业务载荷与 `catch` 捕获的 `unknown`，统一通过 Zod Schema 或 `is` 类型守卫收窄，**禁止用 `as T`、`as Record<string, unknown>`、`as never`、`as unknown as` 绕过运行时校验**（测试同理：用真实工厂或窄契约替身，不将残缺对象强转为完整上下文）。
- **读取 `unknown` 对象属性用 `in` 检查存在性**：对象判非空后以 `'code' in err` 或 `Object.hasOwn` 判定，不靠 `as { code?: string }` 扩充形状，避免 `null` 或非对象抛出新异常。
- **禁止半截类型守卫**：守卫声明的目标类型所依赖的所有字段都须经过验证，不能仅查单个判别字段（如 `role`）即断言为完整复杂类型。

```typescript
// ❌ 不好的实践：直接断言 unknown 或只查单个字段断言全类型
const statusText = (error as { statusText?: string }).statusText;
const payload = JSON.parse(raw) as ConfigPayload;

// ✅ 好的实践：存在性检查收窄错误对象，复杂载荷走 Zod Schema
const getStatusText = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'statusText' in error) {
    return typeof error.statusText === 'string' ? error.statusText : undefined;
  }
  return undefined;
};

const isValidNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
```

### 空值、缺省与增量更新语义

- **区分三态**：严格区分 `undefined`（未传/上游缺失，保留原值或模板默认值）、`null`（显式清空）与有效零值（`0`、`false`、`''`）。
- **严格比较与空值合并**：所有相等比较必须使用 `===` / `!==`（禁止 `== null` / `!= null`）；同时判断空值写成 `value === null || value === undefined`；有效业务值可为 `0`/`false`/`''` 时，禁止 `!value` 判空并用 `??` 替代 `||` 取默认值。
- **增量更新与导入不误覆写**：外部目录导入、配置解析或局部保存（patch）时，禁止将上游缺失值强转为 `0` 或 `''` 覆盖既有有效配置与模板默认值，也禁止用缺省表单字段覆盖未提交字段。

```typescript
// ❌ 不好的实践：宽松比较与 || 误覆盖 0、''
if (maxInputTokens == null) return tier;
const version = lastVersion?.version || 0;

// ✅ 好的实践：显式空值判断与 ?? 保留有效零值
if (maxInputTokens === null || maxInputTokens === undefined) return tier;
const version = (lastVersion?.version ?? -1) + 1;
```

### Zod Schema 与 OpenAPI 风格

Zod schema 同时承担运行时校验、TypeScript 类型推导和 OpenAPI 生成来源。新增或调整 API 时遵守：

- **业务结构归属业务目录**：通用结构放在 `packages/global/core/**/type.ts` 等业务归属目录；`packages/global/openapi/**` 只声明接口 query/body/response/path、接口专用兼容 wrapper（须在旁注释原因）与文档元信息，不复制通用业务类型。
- **优先复用并就地补 `meta`**：OpenAPI schema 直接复用业务 schema；通用字段说明写在业务 schema 的 `meta`，单接口视角说明用 `SomeSchema.shape.field.meta(...)` 补充；每个对外字段补齐 `description`，关键入参与返回值补 `example`。
- **不定义占位 Schema 与多余信封**：response schema 默认只声明业务 `data`，不重复声明统一响应 envelope（`code`、`statusText`），仅路由直接返回这些字段时才声明。无 query/body/params 时不建 `z.object({})` 且不调 `parseApiInput`；无业务返回数据时不建 `z.undefined()` / `z.null()` / `z.object({})`，handler 直接返回 `undefined`（统一中间件包成 `data: null`）。存在实际业务数据时仍须在 API 边界做 Zod 校验。
- **容错数值与布尔**：API 入参、客户端传输结构与配置字段优先用 `@fastgpt/global/common/zod` 的 `BoolSchema`、`NumSchema`、`IntSchema`，禁止直接写 `z.coerce.number()`；普通数值用 `NumSchema`，非负整数/数量/分页用 `IntSchema`，布尔用 `BoolSchema`（仅明确拒绝字符串形态时保留 `z.number()` / `z.boolean()`）。仅客户端使用的 API 也须按客户端实际传参形态定义 schema。
- **废弃标记与 Tag 归属**：废弃字段用 `.meta({ deprecated: true })` 标记（不单靠 `@deprecated` 或文案，已发布字段的弃用流程见[契约兼容与跨仓联动](#契约兼容与跨仓联动)）；通用能力被业务复用时挂通用 + 业务双 tag，业务私有接口只挂业务 tag；仅实际开放接口加 apikey tag。

```typescript
import { BoolSchema, IntSchema, NumSchema } from '@fastgpt/global/common/zod';

export const UpdateConfigSchema = z.object({
  enabled: BoolSchema.meta({ description: '是否启用' }),
  limit: IntSchema.optional().meta({ description: '最大数量' }),
  temperature: NumSchema.optional().meta({ description: '温度参数' }),
  teamTags: z.array(z.string()).optional().meta({
    description: '旧版团队标签',
    deprecated: true
  })
});
```

### 契约兼容与跨仓联动

- **不使用 `.strict()`**：新增 Schema 一律使用默认的 `z.object`（未知字段自动剔除），不使用 `.strict()` 或 `z.strictObject`。新版服务端、`pro` 或客户端增加字段是滚动升级的常态，`.strict()` 会让旧版本直接解析失败。存量 `.strict()` 在修改相关 Schema 时移除，不批量改造。
- **已发布字段只弃用不删除**：已发布版本（以 `document/content/self-host/upgrading/` 的发布状态为准）的 API、OpenAPI、SDK 或持久化 Schema 字段，不得直接删除、重命名或改变类型；用 `.meta({ deprecated: true })` 标记弃用并保留读取兼容，替代字段与旧字段并存，在后续版本经迁移确认无消费者后再移除。仍在开发中、未发布的字段可以直接调整。
- **读宽写严与迁移窗口保护**：写入 Schema 的约束（整数、必填、长度、新增枚举值等）不得直接复用为列表、详情或历史数据的读取 Schema；读取侧单独派生宽松 Schema，容忍历史 `null`、缺省或旧字段（在读取归一化边界兜底，避免单条旧记录阻断整页列表），新写入保持严格校验。回填迁移完成前，常规表单编辑与导入导出不得静默覆盖待回填字段。
- **跨包与 `pro` / `sdk` 消费方同步**：修改 `packages/*` 公开签名、错误信封、工作流运行时字段或 OpenAPI Schema 时，必须同步检索主仓、`pro/` 与 `sdk/` 全部消费方；引用 workspace 包子路径时，目标包声明了 `package.json` `exports`（如 `@fastgpt/dal`、`@fastgpt/workflow-core`）则只能使用其中声明的公开入口，未声明 `exports` 的包按现有模块边界与类型检查验证。

### Zod 枚举变更与历史兼容

- **变更 Zod 枚举默认必须兼容旧数据与旧客户端**：增删改 `z.enum()`、`z.literal()` 或 `z.discriminatedUnion()` 判别结构时，须核对历史库数据、缓存、旧客户端与上下游返回值。
- **最小范围 `.catch()` 兜底并显式处理**：无法识别的旧值按语义降级为 `undefined`（`.optional().catch(undefined)`）或将 `'unknown'` 纳入枚举用 `.catch('unknown')`（必填非空字符串先校验再 `.pipe()` 兜底）；严禁将未知值映射为有效业务动作，也不得对整个对象/响应兜底掩盖其他错误。业务侧须显式处理兜底分支。
- **读写分离与有意不兼容注释**：共享 Schema 同时用于读写时，优先在读取边界派生兼容 Schema，不因兼容旧数据放宽新写入约束；仅在 Schema 或校验处明确注释「不兼容旧值」（含原因、影响版本及迁移/拒绝策略）时才允许有意拒绝旧数据。回归验证须同时覆盖合法值、旧/未知值降级及业务兜底分支。

```typescript
// 历史消息中的旧动作允许降级为未识别，不推断用户原本的操作。
const PersistedActionSchema = z.enum(['confirm', 'revise', 'cancel']).optional().catch(undefined);

const StoredStatusEnum = z.enum(['active', 'archived', 'unknown']);
// 历史读取允许缺失或无效状态统一降级；必填输入先校验非空字符串再对枚举兜底。
const StoredStatusSchema = StoredStatusEnum.catch('unknown');
const RequiredStoredStatusSchema = z.string().min(1).pipe(StoredStatusSchema);
```

## 写法惯例与文案

### 函数参数不超过 2 个，多参数用对象传递

独立参数不超过 2 个，超过时改为对象参数，便于扩展且无需关心顺序。

```typescript
// ❌ 不好的实践
function createVersion(skillId: string, teamId: string, tmbId: string, version: number) {}

// ✅ 好的实践
function createVersion(data: { skillId: string; teamId: string; tmbId: string; version: number }) {}
```

### 局部表达惯例

- **可选链调用回调**：用 `onProgress?.({ phase: 'creatingContainer' })` 取代 `if (onProgress) onProgress(...)`。
- **IIFE 取代可变 `let` + `if/else` 赋值**：条件计算单一值时用 `const value = (() => { ... })();` 保持不可变绑定。
- **解构重命名**：多来源同名字段在解构时直接重命名（如 `const { usage: guidanceUsage } = ...;`），避免 `r1` / `r2` 临时变量。

### 按处理步骤分段，使用空行和注释说明流程

多步骤业务函数按职责分段，不同步骤之间留一个空行，同一步骤内紧密语句保持相邻：

- 每个主要步骤前加简短中文注释说明职责或关键约定，顺序明确的长流程可用 `// 1. ...`、`// 2. ...` 标注，调整流程时同步更新编号；简单自解释代码不强行注释，避免复述语句的无效注释。
- 对并发校验、事务提交、回滚、资源清理等易误解边界，说明执行顺序与原因（如提交成功前保留旧资源）。函数级 `/** ... */` 说明整体职责与契约，步骤注释说明局部流程，两者不重复。

```typescript
// 1. 读取索引快照，保留版本以便提交时检查并发修改。
const snapshot = await readIndexSnapshot(dataId);

// 2. 计算需要替换的索引，未变化的向量继续复用。
const patch = buildIndexPatch(snapshot);

// 3. 写入会回填新 ID，必须提前保存待清理的旧 ID。
const oldVectorIds = getReplacedVectorIds(patch);
await insertVectorsForPatch(patch);

// 4. 校验快照并提交；提交成功前保留旧向量，供失败重试使用。
await commitIndexPatch({ snapshot, patch });

// 5. 提交成功后再清理被替换的旧向量。
await cleanupReplacedVectors(oldVectorIds);
```

### i18n 文案

- 每个用户可见文案 key 必须以完整静态字面量注册：前端 `t('ns:key')`、服务端或映射表 `i18nT('ns:key')`；禁止模板拼接、变量拼接或三元表达式拼出 key，避免清理脚本误删或界面裸显 key。新增 key 时补齐 [LocaleList](../../packages/global/common/i18n/type.ts) 全部语言。
- 运行时从已静态注册的映射中选取完整 key（如工作流诊断按错误码选取 `i18nT` 注册的 key），或使用后端、配置下发的已注册完整 key 时，按[动态 i18n Key 收窄调用边界](#规避高开销类型实例化热点不以牺牲契约为代价)调用。

## 状态闭环与安全边界

适用于新增或修改的业务链路；不借此改造未改动的存量组件。

### 异步控制、异常传播与清理

- **隔离在途异步响应**：流式输出、保存后重拉、切换应用/会话等并发场景，须通过请求序号、`AbortController` 或版本标识校验响应归属，防止陈旧响应覆盖新状态或误推进分页游标。
- **不丢失异常，不让清理覆写主结果**：独立后台异步任务不得只写 `void promise`，必须 `.catch(onError)` 接住 rejection；Node Stream 与 `pipeline` 在消费前绑定 `error` 监听避免未处理事件击穿进程；`finally` 与非关键清理（如删临时目录、关辅助连接）统一用 `.catch(() => {})` 或独立 `try/catch` 隔离，防止清理异常中断主流程或覆盖已提交结果。
- **结果未知时保留未知状态**：超时、连接中断或提交应答丢失只说明结果未知，不能直接报告失败或触发回滚、补偿；先查询权威状态确认终态，无法确认时向上暴露「结果未知」（数据库事务提交结果未知由 DAL 抛出 `DbTransactionOutcomeUnknownError`，不得吞掉或改判失败）。
- **自动重试必须重放安全**：只对确认未生效或可安全重放的操作自动重试，通过幂等键、版本号或 compare-and-set 保证重放不重复生效；数据库事务冲突重试交由 `runInTransaction`。一次性凭据（下载票据、验证码）、扣费与无幂等键外部写入不得自动重试；断点续跑不得重复计数已完成项。
- **副作用不越过事务与验收边界**：数据库事务内的缓存失效、消息唤醒、外部清理等不可回滚动作统一挂入 `tx.afterCommit(...)` 或在提交成功后执行；新增或修改受审计字段时同步审计映射与展示文案，审计内容以本次事务实际提交状态为准，且审计补充查询失败不得使已提交写入报错；升级/迁移旧资源须在切换验收确认后再做破坏性删除。

### 错误分类与统一日志

- **保留系统级异常分类**：捕获 `fetch`、代理或外部调用异常时，先按结构化 `code` / `cause`（如 `EMFILE`、`ENOSPC`、部署方配置的实例级代理故障）保留系统异常，禁止将通用 `'fetch failed'` 无条件降级为 `UserConfigError`（4xx）。
- **统一日志入口与载荷脱敏**：服务端（`packages/service`、API 路由、后台任务）及被服务端调用的共享转换一律使用 `@fastgpt/service/common/logger`（`getLogger` + `LogCategories`，详见 [Logger 使用规范](../design/common/logger/index.md)），禁止 `console.*`（CLI 与独立构建脚本除外）；共享纯转换如需告警，返回诊断信息交由调用方记录。错误通过 `error` 字段传入完整对象；日志与 OTel 严禁写入密钥、Token、完整签名 URL、完整 `response.headers`、完整对话/用户输入及上游未脱敏错误原文。

### 权限、凭据与输入安全

- **出参按调用方权限白名单返回**：子资源、批量结果按各自权限过滤，入口鉴权不覆盖其下全部子资源元数据；匿名分享与公开接口先完成公开裁剪再提取字段，不透出节点内部错误原文、上游响应体或堆栈。
- **凭据只写不回显**：密钥、代理账密保存后，读取接口仅返回是否已配置或掩码；部署方实例级凭据不得注入租户可执行环境（沙箱、插件、用户代码）。
- **不可信归档与路径边界**：解析用户上传的压缩包或表格（ZIP、tar、XLSX 等）前校验文件大小、解压后累计字节预算与条目路径归一化；目录边界校验使用规范化相对路径（禁仅用 `startsWith`），读写或删除本地路径前防范符号链接逃逸。

### 资源有界与生命周期释放

- **用量有界**：数据规模由用户或外部输入决定时，按稳定游标分批读取，文件与归档流式处理（不整文件/整批读入内存）；后台并发任务设进程级上限；子进程输出、远端响应与日志缓冲设大小上限，超时后停止派发后续工作。
- **生命周期闭环**：使用原生 `fetch` 时，未消费或非 2xx 响应体显式 `cancel()` 或消费释放连接；连接池、socket、Stream、定时器与事件监听器在超时、取消及进程退出路径确定释放并排空缓冲。

## 数据库与持久化访问

### 数据写操作支持可选 `tx?: DbSession` 显式事务参数

涉及数据库写操作的 Repository 与 Service 方法统一支持可选的 `tx?: DbSession` 参数（从 `@fastgpt/dal/db/types` 导入，严禁使用 `AsyncLocalStorage` 隐式传播或直接暴露 Mongoose `ClientSession`）。事务统一通过 `@fastgpt/dal/db/transaction` 的 `runInTransaction` 发起，内部自动处理开启、提交、回滚、写冲突重试以及 `tx.afterCommit` 提交后副作用触发。

```typescript
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';

// mongo/repo.ts —— 通过基类 this.txOpts(tx) 透传底层会话
async createVersion({ data, tx }: { data: CreateVersionInput; tx?: DbSession }) {
  const [doc] = await this.model.create([data], this.txOpts(tx));
  return this.parseRow(doc.toObject());
}

// service.ts —— 外部已传入 tx 时直接复用，否则由 runInTransaction 开启新事务；缓存失效挂入 afterCommit
async createAppAndInitVersion({ data, tx }: { data: CreateAppWriteInput; tx?: DbSession }) {
  const execute = async (activeTx: DbSession) => {
    const app = await this.appRepo.createApp({ data, tx: activeTx });
    await this.versionRepo.createVersion({ data: { appId: app._id, version: 0 }, tx: activeTx });
    activeTx.afterCommit(() => invalidateTeamAppCache(data.teamId));
    return app;
  };

  if (tx !== undefined) {
    return execute(tx);
  }
  return runInTransaction(execute);
}
```

### 显式投影与大字段过滤

- 业务列表、检索与批量回表查询须显式指定投影，仅读取所需字段，避免无投影拉取 `content`、`vectorData`、`fileContent`、大二进制等大字段。
- DAL 仓储读取出口统一经过 `parseRow` / `parseList` 归一化校验，不得用 `z.unknown()` 绕过仓储出口校验。

### MongoDB 4.4 `$lookup` 兼容

数据库侧过滤、排序或分页必须保留 `$lookup` 时遵守：

- 禁止在同一个 `$lookup` 中混用 `localField`/`foreignField` 与 `pipeline`（MongoDB 4.4 / FCV=4.4 会直接报错），必须改用 `let + pipeline + $match($expr)`。
- 可缺省外键在 `let` 中必须用 `$ifNull: ['$field', null]` 归一化，防止 MongoDB 4.4/5.0 因 missing 字段跳过索引改写退化为全表扫描。

### 跨集合补充字段优先应用层批量回表

跨集合补充展示字段，且外键高度重复、被关联文档较大无覆盖索引，或展示列可选时，优先在应用层按需批量回表：

- 入库已由 Mongoose `Schema.Types.ObjectId` 强约束的字段，业务读取与构建/查询 `Map` 直接使用 `String(id)`，不做多余的二次类型校验。
- 全局 `find` post hook（`convertObjectIds`）会将顶层 `ObjectId` 转为 `string`：传给后续 `find({ _id: { $in } })` 时由 Mongoose 自动转型，传给 `aggregate` `$match` 时需显式 `new Types.ObjectId(id)`（`aggregate` 不做自动转型）。
- 多批次弱一致性从库读取（如日志流式导出）可统一走 `readFromSecondary`；跨批次缓存应**仅持久化实际命中的结果**，不得将从库查空永久固化为整次导出内已确认的缺失。对未命中 ID 可采用**批次指数退避 + TTL 过期重查**（如 `createAppVersionNameLoader`），兼顾跨多批复制延迟自动追平与防止已删除历史外键在数百批次中线性空查。
- 同一业务域（如列表与导出）的底层批量查询与统计口径应沉淀在仓储/数据访问层共用，避免在 API 路由层双写导致口径漂移。

```typescript
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';

// ✅ 好的实践：Schema 已强约束为 ObjectId，显式投影批量回表并用 String(id) 建 Map
const versionIds = Array.from(
  new Set(rows.map((row) => row.appVersionId).filter(Boolean).map(String))
);
const versions =
  versionIds.length > 0
    ? await MongoAppVersion.find(
        { _id: { $in: versionIds } },
        { _id: 1, versionName: 1 },
        readFromSecondary
      ).lean()
    : [];
const versionNameMap = new Map(
  versions.map((version) => [String(version._id), version.versionName ?? null])
);
```

## TypeScript 编译性能与 Composite 规范

`packages/{global,dal,web,service}` 通过 `tsconfig.composite.json` 接入 Project References（`tsc -b`），用于将 `projects/app` 的类型检查拆分为分层增量构建。日常开发须遵守以下约定：

### 保持包间单向依赖，禁止反向 `import type`

- 包依赖必须保持有向无环图（`global → dal / web → service → app`），底层包禁止引用上层包，即使只用 `import type` 也会破坏 `composite` 编译边界。
- 共享数据结构与参数契约下沉至 `packages/global`，上层包（如 `packages/web` 的 UI 展示文案映射）单向引用底层契约，且不留过渡性 re-export。

### Composite 包导出须满足 `--declaration` 可序列化

开启 `declaration: true` 后，TS 必须为每个导出符号生成可移植的 `.d.ts`。IDE 默认读取普通 `tsconfig.json`，不会提前报 `TS2883` / `TS7056`，改动 `packages/*` 导出签名后必须运行 `pnpm --filter @fastgpt/app typecheck` 验证。

- **避免泄露 pnpm 传递依赖类型**：导出函数不得隐式返回未直接声明在当前包 `package.json` 的内部类型（如 `mongoose` 底层的 `mongodb.DeleteResult`、`multer` 底层的 `@types/express`、`lodash-es` 底层的 `@types/lodash`）。
- **Mongo 返回值复用统一导出类型**：`packages/service` 中直接返回 `deleteOne` / `deleteMany` / `bulkWrite` / `collection.find` / `GridFS` 流的导出函数，统一标注 `packages/service/common/mongo` 导出的真实类型别名（`MongoDeleteResult`、`MongoBulkWriteResult`、`MongoFindCursor`、`MongoGridFSBucketReadStream`），不手写局部结构镜像，也不弱化为 `Record<string, unknown>`。
- **遏制超长泛型推导**：含泛型 `.populate<T>().lean()` 的导出函数显式标注返回类型与 `.lean<...>()`（避免 `TS7056`）；`memoize`、Zustand 中间件、聚合 OpenAPI 文档（`oas31.OpenAPIObject`）等深度推导导出显式声明外部可见类型。

```typescript
import type { ClientSession, MongoDeleteResult } from '../../../common/mongo';

// ❌ 不好的实践：隐式返回传递依赖 mongodb.DeleteResult，触发 TS2883
export const cleanCountLimit = async ({ teamId }: { teamId: string }) =>
  MongoCountLimit.deleteMany({ key: teamId });

// ✅ 好的实践：显式标注 common/mongo 导出的真实驱动类型
export const cleanCountLimit = async ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}): Promise<MongoDeleteResult> => MongoCountLimit.deleteMany({ key: teamId }, { session });
```

### 规避高开销类型实例化热点，不以牺牲契约为代价

- **动态 i18n Key 收窄调用边界**：项目 i18next 联合类型包含数千个 key，禁止对运行期动态字符串直接写 `t(dynamicKey as any)` 或 `t(dynamicKey as ParseKeys)`；应先将 `t` 收窄为 `(key: string, options?: Record<string, unknown>) => string` 或通过统一动态翻译 helper 调用。
- **表单泛型剔除无关递归字段**：`useForm<T>()` 仅包含表单实际 `register` / `watch` 的字段，用 `Omit<...>` 排除深层递归字段（如 `workflow`），避免 `FieldPath<T>` 递归路径展开爆炸。
- **严禁破坏公共类型契约的“伪优化”**：不得通过 `import('pkg' as string)` 绕过三方库类型检查，不得为压 `.d.ts` 体积将公开 Zod Object 强擦除为 `z.ZodType`（会丢失 `.shape` / `.strict()` / `.safeExtend()`），也不得破坏已发布 SDK 的 `protected` 继承契约。

```typescript
// ❌ 不好的实践：触发全量 6,000+ i18n key 重载分发
const text = t(dynamicLabel as any);

// ✅ 好的实践：在边界收窄动态翻译签名（静态字面量 key 仍直接调用 t('ns:key')）
const translate = t as (key: string, options?: Record<string, unknown>) => string;
const text = translate(dynamicLabel);
```

### `tsconfig.json` 与 `tsconfig.typecheck.json` 职责分离

- 应用的 `tsconfig.json` 服务于 IDE 与 `next dev` / Turbopack，保留 `sdk/*/src` 源码 `paths` 映射以保证开发态联动，禁止写跨包宽泛 glob（如 `../../packages/**/*.ts`），并保持随镜像交付的 `scripts/**/*.ts` 纳入检查。
- `tsconfig.typecheck.json` 专用于 `tsc -b` 增量检查，在此覆写 `paths` 消费预构建 SDK 声明并引用各包 `tsconfig.composite.json`。
- 因 `tsdown` 声明构建不执行完整类型检查，凡被 `tsconfig.typecheck.json` 改为消费声明、但仍由镜像编译源码的 workspace SDK（如 `@fastgpt-sdk/storage`、`@fastgpt-sdk/otel`、`@fastgpt-sdk/sandbox-adapter`），其源码类型检查归属各自 workspace 的 `typecheck` 脚本，且必须同步接入所有启用 `SKIP_TYPE_CHECK=true` 的 CI `typecheck-app` 门禁。
