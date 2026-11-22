# 代码规范

## 目录与分层

采用 DDD 分层架构，跨实例协作使用**依赖注入**（Dependency Injection，遵循依赖倒置原则）：下层不感知上层，同层实例互不引用，需要其他实例的能力时由上层以函数参数传入。新代码必须遵守；存量代码在修改时逐步迁移，不在无关 PR 中批量重构。

### 分层架构

"实例"指拥有独立 `schema.ts` 的业务对象，例如 App、AppVersion、Dataset、Chat；没有独立 schema、只为拆分文件而建的子目录，与上级属于同一实例。

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 1. 实例原子层（实体 / 仓储） | `global/core/<域>/type.ts`、`constants.ts` | 前后端共享的类型与常量 |
| | `schema.ts` | Mongoose Schema 定义，导出 Model 和 SchemaType |
| | `entity.ts` | 单次、不可再分的读写，如 `findById`、`create`、`updateById`，不含业务判断 |
| | `utils.ts` | 纯函数工具，无副作用，可独立单测 |
| 2. 实例业务层（领域服务） | `service.ts` | 把本实例的原子操作组合成更高阶的业务操作，承载本实例的业务规则 |
| 3. 业务编排层（应用服务 / 用例） | `orchestration.ts` | 组合多个实例业务层，向上暴露完整用例；开启事务并注入依赖；只涉及单个实例时不创建 |
| 4. API 层（接口层） | `projects/*/src/pages/api/**`，契约在 `global/openapi/**` | 鉴权、入参校验与出参组装，调用编排层或单个实例业务层 |

- `orchestration.ts` 放在用例主导业务域目录下；只被单个应用使用且依赖其私有能力时，放在该应用的 `src/service/<域>/`。
- `auth.ts` 封装资源鉴权，只供 API 层或编排层入口调用。

依赖规则：

- 只能向下依赖，禁止反向依赖上层。原子层和实例业务层禁止 import 其他实例的 `schema.ts`、`entity.ts`、`service.ts`。
- 注入的依赖优先传**操作函数**，不传另一个实例的模块对象、Model 或整个 service；函数签名由使用方在本实例内用 `type` 声明所需的最小契约，不用 `typeof` 引用其他实例的实现。
- 只涉及单个实例的用例，API 层直接调用该实例业务层，不为凑满分层新增只做透传的编排函数；上层也可直接调用下层已有能力。
- 事务由发起组合的层（通常是编排层）通过 `mongoSessionRun` 开启，`session` 沿参数逐层传递，见[数据写操作函数支持可选 session 参数](#数据写操作函数支持可选-session-参数)。
- 鉴权与权限判断放在 API 层或编排层入口；实例业务层接收已确认的 `teamId`、`tmbId` 等可信参数。
- `global/core/` 只放类型和常量，**禁止**引入 mongoose、服务端 SDK；`service/core/` 只在服务端使用，**禁止**被 `packages/web/` 或前端页面直接引用。
- 不新增 `controller.ts`。存量 `controller.ts` 按实际职责归入以上各层，在修改相关代码时迁移。

### 目录结构

按业务域 → 子功能 → 固定文件组织：

```
packages/
├── global/core/              # 原子层：类型、常量（前后端共享）
│   ├── app/
│   │   ├── type.ts           # 顶层聚合类型
│   │   ├── constants.ts
│   │   ├── workflow/
│   │   │   ├── type.ts
│   │   │   └── constants.ts
│   │   ├── version/
│   │   │   └── type.ts
│   │   └── evaluation/
│   │       └── type.ts
│   ├── chat/
│   ├── dataset/
│   └── plugin/
│
└── service/core/             # 后端业务逻辑（不可在前端引用）
    ├── app/                  # App 实例
    │   ├── schema.ts         # 原子层：App 主表 Schema
    │   ├── entity.ts         # 原子层：App 单次读写
    │   ├── utils.ts          # 原子层：纯函数
    │   ├── service.ts        # 实例业务层：只组合 App 自身操作，其他实例通过参数注入
    │   ├── orchestration.ts  # 业务编排层（如有）：组合 App、AppVersion、Chat 等实例业务层
    │   ├── auth.ts           # 鉴权（如有）：供 API 层或编排层入口调用
    │   ├── version/          # AppVersion 实例（有独立 schema），与 App 互不引用
    │   │   ├── schema.ts
    │   │   ├── entity.ts
    │   │   ├── service.ts
    │   │   └── utils.ts
    │   ├── evaluation/       # 多个 schema 合并到单个 schema.ts
    │   │   ├── schema.ts
    │   │   ├── entity.ts
    │   │   ├── service.ts
    │   │   └── utils.ts
    │   ├── logs/
    │   └── tool/             # 无独立 schema，属于 App 实例的业务拆分
    │       ├── service.ts
    │       └── utils.ts
    ├── chat/
    ├── dataset/
    └── plugin/
```

- 子功能目录不超过 **3 层**嵌套。
- 无需拆子功能时，目录内直接放 `schema.ts` + `entity.ts` + `service.ts` + `utils.ts`，需要跨实例组合时再加 `orchestration.ts`。
- 多个 schema 文件（如 `evalSchema.ts` + `evalItemSchema.ts`）**合并**到单个 `schema.ts`。

### 跨实例依赖通过函数注入

```typescript
// ❌ 不好的实践：App 实例业务层直接引入 Chat、AppVersion 实例
import { deleteChatsByAppId } from '../chat/service';
import { MongoAppVersion } from './version/schema';

export const deleteApp = async (appId: string, session?: ClientSession) => {
  await deleteChatsByAppId({ appId, session });
  await MongoAppVersion.deleteMany({ appId }, { session });
  await deleteAppById(appId, session);
};

// ✅ 好的实践
// app/service.ts —— 实例业务层：在本实例声明所需的函数契约，由上层注入
type CleanupAppRelationsFn = (params: { appId: string; session: ClientSession }) => Promise<void>;

export const deleteApp = async (props: {
  appId: string;
  session: ClientSession;
  cleanupRelations: CleanupAppRelationsFn[];
}) => {
  const { appId, session, cleanupRelations } = props;

  // 1. 先清理关联数据，再删除 App 本身，避免残留孤儿数据。
  for (const cleanup of cleanupRelations) {
    await cleanup({ appId, session });
  }

  // 2. 删除 App 主记录。
  await deleteAppById(appId, session);
};

// app/orchestration.ts —— 业务编排层：组合多个实例业务层，开启事务并注入依赖
export const deleteAppWithRelations = (appId: string) =>
  mongoSessionRun((session) =>
    deleteApp({
      appId,
      session,
      cleanupRelations: [deleteChatsByAppId, deleteVersionsByAppId]
    })
  );

// pages/api/core/app/del.ts —— API 层：鉴权、校验入参后调用编排层
const { appId } = parseApiInput({ req, query: DeleteAppQuerySchema });
await authApp({ req, appId, per: OwnerPermissionVal });
await deleteAppWithRelations(appId);
```

注入函数也是测试接缝：实例业务层的单测直接传入 fake 函数，无需 mock 其他实例的模块。

### 禁止 re-export

禁止使用 `export { ... } from '...'`、`export type { ... } from '...'` 或 `export * from '...'` 转导其他模块的成员，包括 `index.ts` barrel、目录聚合入口和兼容旧路径的转发文件。

- 每个导出只能由其实际定义文件提供，使用方直接从定义模块导入
- `index.ts` 可以包含自身的实现和定义，但不能聚合导出其他文件
- 移动定义时，直接修改所有使用方的 import；确认旧路径无引用后删除旧文件
- 不为缩短 import 路径、隐藏目录结构或兼容旧路径新增转导层，避免依赖来源不明确、循环依赖和无效模块加载

```typescript
// ❌ 不好的实践：通过目录入口转导其他模块
export { createLLMResponse } from './createLLMResponse';
export type { LLMResponse } from './type';
export * from './constants';

// ✅ 好的实践：使用方直接引用成员的定义模块
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/createLLMResponse';
import type { LLMResponse } from '@fastgpt/global/core/ai/llm/type';
```

## TypeScript 写法

### 使用 `type` 进行类型声明，不使用 `interface`

```typescript
// ❌ 不好的实践
interface User {
  id: string;
  name: string;
}

// ✅ 好的实践
type User = {
  id: string;
  name: string;
}
```

### 类型守卫

用 `is` 关键字收窄 `unknown` / `any` 类型，替代强制断言。

```typescript
// ❌ 不好的实践
function process(value: unknown) {
  const n = value as number; // 不安全
}

// ✅ 好的实践
const isValidNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

if (isValidNumber(value)) {
  // 此处 value 安全收窄为 number
}
```

### 使用严格相等比较

所有相等和不等比较必须使用 `===` 和 `!==`，禁止使用 `==` 或 `!=`，空值判断也不例外，避免依赖隐式类型转换。

- 同时判断 `null` 和 `undefined` 时，显式写成 `value === null || value === undefined`。
- 同时排除 `null` 和 `undefined` 时，显式写成 `value !== null && value !== undefined`。
- `0`、`false` 和 `''` 是有效业务值时，不要用 `!value` 代替空值判断；取默认值时使用 `??`。

```typescript
// ❌ 不好的实践：宽松比较隐式同时匹配 null 和 undefined
if (maxInputTokens == null) {
  return tier;
}

// ✅ 好的实践：显式覆盖两种空值，并保留 0 上限的语义
if (maxInputTokens === null || maxInputTokens === undefined) {
  return tier;
}

// ✅ 好的实践：严格排除两种空值
if (maxInputTokens !== null && maxInputTokens !== undefined) {
  return currentInputTokens <= maxInputTokens;
}
```

### 空值合并取默认值

用 `??` 取代 `||` 处理默认值，避免 `0`、`false`、`''` 被错误覆盖。

```typescript
// ❌ 不好的实践
const version = lastVersion?.version || 0;  // version 为 0 时被误覆盖
const text = item?.value || '';

// ✅ 好的实践
const version = (lastVersion?.version ?? -1) + 1;
const text = item?.value ?? '';
```

### 可选链调用回调

用 `?.()` 调用可选回调，取代 `if (fn) fn()` 的冗余写法。

```typescript
// ❌ 不好的实践
if (onProgress) {
  onProgress({ phase: 'creatingContainer' });
}

// ✅ 好的实践
onProgress?.({ phase: 'creatingContainer' });
```

### 使用 IIFE 取代 if/else 进行变量条件赋值

```typescript
// ❌ 不好的实践
if (condition) {
  value = true;
} else {
  value = false;
}

// ✅ 好的实践
const value = (() => {
  if (condition) {
    return true;
  }
  return false;
})();
```

### 解构重命名

同名变量来自多个来源时，解构时重命名，避免命名冲突。

```typescript
// ❌ 不好的实践
const r1 = await getSkillGuidance(...);
const r2 = await createLLMResponse(...);
const inputTokens = r1.usage.inputTokens + r2.usage.inputTokens;

// ✅ 好的实践
const { usage: guidanceUsage } = await getSkillGuidance(...);
const { usage: generateUsage } = await createLLMResponse(...);
const inputTokens = guidanceUsage.inputTokens + generateUsage.inputTokens;
```

### 函数参数不超过 2 个，多参数用对象传递

独立参数不超过 2 个，超过时改为对象参数，便于扩展且无需关心顺序。

```typescript
// ❌ 不好的实践
function createVersion(skillId: string, teamId: string, tmbId: string, version: number) {}

// ✅ 好的实践
function createVersion(data: { skillId: string; teamId: string; tmbId: string; version: number }) {}
```

## 流程组织与错误处理

### 按处理步骤分段，使用空行和注释说明流程

函数包含多个处理步骤时，按业务职责组织代码，避免把读取、转换、差量计算、写入和清理等操作连续堆在一起。

- 不同处理步骤之间留一个空行；同一步骤内紧密相关的语句保持相邻，不逐行添加空行。
- 多步骤业务函数在每个主要步骤前添加简短中文注释，说明该步骤的职责、关键约定或设计原因。顺序明确的长流程可使用 `// 1. ...`、`// 2. ...` 标注，调整流程时同步更新编号。
- 对并发校验、事务提交、回滚、资源清理等容易误解的边界，说明执行顺序及其原因，例如为什么必须在写入前保存旧 ID、提交成功后才能删除旧资源。
- 简单且命名已充分表达含义的代码不强行编号或添加注释；避免只复述语句的“查询数据”“设置变量”“返回结果”等注释。
- 函数级 `/** ... */` 说明整体职责和输入输出约定，步骤注释说明局部流程，两者避免重复。

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

### 非关键清理用 `.catch()` 链

次要的清理操作（不影响主流程）用 `.catch()` 吞掉错误，不污染主 try/catch。

```typescript
// ❌ 不好的实践
try {
  await client.delete();
} catch {
  // 清理失败，主流程中断
}

// ✅ 好的实践
await client.delete().catch(() => {});
```

## Zod 与 API 契约

### 类型推导：Zod schema 同时承担校验和类型

用 `z.infer` 从 schema 推导类型，不重复手写相同结构的 type。

```typescript
// ❌ 不好的实践
type MessageParam = { role: 'user' | 'assistant'; content: string };
const MessageParamSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string() });

// ✅ 好的实践
export const MessageParamSchema = z.discriminatedUnion('role', [...]);
export type MessageParam = z.infer<typeof MessageParamSchema>;
```

### Zod Schema 与 OpenAPI 风格

Zod schema 同时承担运行时校验、TypeScript 类型推导和 OpenAPI 生成来源。新增或调整 API 时，按下面规则组织：

- 业务通用结构放在业务归属目录，例如 `packages/global/core/app/type.ts`、`packages/global/core/workflow/type/node.ts`、`packages/global/support/permission/**/controller.ts`。`packages/global/openapi/**` 只声明接口 query/body/response/path、接口专用兼容处理和 OpenAPI 文档信息，不把通用配置类型、权限对象、工具配置等只为文档复制到 openapi 目录。
- OpenAPI schema 优先复用业务 schema。需要字段说明时，优先在业务 schema 上补齐 `meta`；只属于某个接口视角的说明，可以在 openapi schema 里用 `SomeSchema.shape.field.meta(...)` 补充。不要重复建立同构 schema，也不要用 `export const A = B` 这种重命名 alias 当作新 schema 导出。
- 只有接口边界确实需要特殊兼容时，才在 openapi 目录定义专用 wrapper，例如把 `{}` 兼容为 `undefined`、或去掉 JSON Schema 不支持的 function 字段。此类 wrapper 附近要写清楚原因。
- API response schema 默认声明业务 `data` 结构，不重复声明统一响应 envelope，例如 `code`、`statusText`。只有路由实际直接返回这些字段时，才把它们写进 schema。
- 只为实际存在的业务入参和业务出参定义 Schema。请求完全没有 query、body 或 params 时，不创建 `z.object({})` 占位 Schema，也不调用 `parseApiInput`；OpenAPI 省略对应的 `requestParams`/`requestBody`。没有业务返回数据的成功响应不创建 `z.undefined()`、`z.null()` 或 `z.object({})` 占位 Schema，handler 直接不返回值或返回 `undefined`，OpenAPI 只保留状态码和说明；统一响应中间件会把 `undefined` 包成 `data: null`。存在实际业务数据时仍必须在 API 边界执行 Zod 校验。
- 每个对外字段补齐 `description`，关键入参和返回值补 `example`。如果字段语义属于业务通用结构，优先把 `meta` 写到通用 schema；如果只是某接口视角，写到 openapi schema。
- API 入参、客户端传输结构和需要容错解析的配置字段，优先使用 `packages/global/common/zod` 里的 `BoolSchema`、`NumSchema`、`IntSchema`。不要直接写 `z.coerce.number()`；普通数值用 `NumSchema`，非负整数、数量、分页、limit 用 `IntSchema`，布尔配置和查询参数用 `BoolSchema`。只有明确需要严格拒绝字符串/数字形式时，才保留 `z.number()` 或 `z.boolean()`。
- 废弃字段用 `.meta({ deprecated: true })` 标记，可同时保留业务说明，例如 `description: '旧版团队标签'`。不要只写 `/** @deprecated */`，也不要只把“已废弃”写进 `description`。
- Tag 归属按能力复用判断：通用模块接口被业务模块使用时，同时加通用模块 tag 和业务模块 tag；业务模块自己的状态查询或状态操作，只加业务模块 tag。API key 文档只给实际开放接口加 apikey 专用 tag，不开放的接口不要为了分类加 tag。
- 仅客户端使用的 API 也要以客户端实际传参为准定义 schema，避免 `schema.parse` 因 `number`、`boolean` 的字符串形态导致业务不可用。

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

### Zod 枚举变更与历史兼容

- **变更 Zod 枚举时，默认必须兼容旧数据和旧客户端。** 新增、删除、重命名 `z.enum()` 枚举值，或调整 `z.literal()`、`z.discriminatedUnion()` 的判别值和分支结构时，都要检查数据库历史记录、缓存、旧客户端请求及上下游返回值，不能只验证当前版本生成的数据。
- **优先使用 `.catch()` 为无法识别的旧值提供兜底，并在业务侧显式处理。** 可按语义降级为 `undefined` 或明确的 `unknown` 枚举值；不能把未知值自动映射为“确认”等有效业务动作。可选字段使用 `.optional().catch(undefined)`，保持缺省和无法识别时的语义一致。
- **解析结果必须有值时，将 `'unknown'` 纳入枚举，并使用 `.catch('unknown')`。** 直接兜底也会将缺失值、`null` 和类型错误转成 `'unknown'`，仅在业务允许这些情况统一降级时使用。若输入字段必须存在且为非空字符串，先做该层校验，再用 `.pipe()` 对无法识别的枚举值兜底。业务侧应显式处理 `'unknown'`。
- `.catch()` 应放在需要兼容的字段或最小子结构上，避免一处旧值导致整条记录、整页列表或整个对话不可读，也避免对整个响应兜底而掩盖其他错误。业务侧应保留仍可读取的内容，跳过无法识别的动作，并处理缺省分支，不能只让 Zod 校验通过后继续假定字段有效。
- 区分历史读取兼容与新数据写入校验。共享 Schema 同时用于读写时，优先在读取边界派生兼容 Schema，明确兼容范围；不要因为兼容历史数据而意外放宽新请求的业务约束。
- **只有在相关 Schema 或校验调用处明确注释“不兼容旧值”时，才允许有意拒绝旧数据。** 注释必须说明不兼容的原因、受影响的旧值或版本，以及迁移或拒绝策略；仅删除旧枚举值、修改类型或依赖测试通过，不视为已明确不兼容。
- 回归验证至少覆盖：当前合法值保持原语义、旧值或未知值按预期降级，以及业务侧正确处理兜底值。只测试新枚举值能通过校验，不足以验证兼容性。

```typescript
// 历史消息中的旧动作允许降级为未识别，不推断用户原本的操作。
const PersistedActionSchema = z.enum(['confirm', 'revise', 'cancel']).optional().catch(undefined);

const action = PersistedActionSchema.parse(storedAction);
if (action === undefined) {
  // 仍可展示消息正文，但不能恢复或执行无法识别的交互动作。
  showMessageText();
} else {
  handleRecognizedAction(action);
}
```

```typescript
const StoredStatusEnum = z.enum(['active', 'archived', 'unknown']);

// 历史读取允许缺失或无效状态统一降级，解析结果始终有值。
const StoredStatusSchema = StoredStatusEnum.catch('unknown');

// 输入仍须提供非空字符串，只对无法识别的枚举值兜底。
const RequiredStoredStatusSchema = z.string().min(1).pipe(StoredStatusSchema);
```

## MongoDB 数据访问

### 数据写操作函数支持可选 session 参数

涉及数据库写操作的函数统一支持可选的 `session` 参数，便于上层组合事务。事务统一通过 `mongoSessionRun` 发起，内部自动处理 startTransaction / commit / abort / retry。

```typescript
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';

// entity.ts —— 基础操作透传 session
export const createVersion = (data: CreateVersionData, session?: ClientSession) =>
  MongoAppVersion.create([data], { session });

// service.ts —— 需要事务时用 mongoSessionRun 包裹，外部已有 session 时直接传入
export const createAppAndInitVersion = async (
  data: AppCreateParams,
  session?: ClientSession
) => {
  const create = async (session: ClientSession) => {
    const app = await createApp(data, session);
    await createVersion({ appId: app._id, version: 0 }, session);
    return app;
  };

  if (session) {
    return create(session);
  } else {
    return mongoSessionRun(create);
  }
};
```

### MongoDB 4.4 `$lookup` 兼容

数据库侧过滤、排序或分页必须保留 `$lookup` 时遵守：

- 禁止在同一个 `$lookup` 中混用 `localField`/`foreignField` 与 `pipeline`（MongoDB 4.4 / FCV=4.4 会直接报错），必须改用 `let + pipeline + $match($expr)`。
- 可缺省外键在 `let` 中必须用 `$ifNull: ['$field', null]` 归一化，防止 MongoDB 4.4/5.0 因 missing 字段跳过索引改写退化为全表扫描。

### 跨集合补充字段优先应用层批量回表

跨集合补充展示字段，且外键高度重复、被关联文档较大无覆盖索引，或展示列可选时，优先在应用层按需批量回表：

- 入库已由 Mongoose `Schema.Types.ObjectId` 强约束的字段，业务读取与构建/查询 `Map` 直接使用 `String(id)`，不做多余的二次类型校验。
- 全局 `find` post hook（`convertObjectIds`）会将顶层 `ObjectId` 转为 `string`：传给后续 `find({ _id: { $in } })` 时由 Mongoose 自动转型，传给 `aggregate` `$match` 时需显式 `new Types.ObjectId(id)`（`aggregate` 不做自动转型）。
- 多批次弱一致性从库读取（如日志流式导出）可统一走 `readFromSecondary`；跨批次缓存应**仅持久化实际命中的结果**，不得将从库查空永久固化为整次导出内已确认的缺失。对未命中 ID 可采用**批次指数退避 + TTL 过期重查**（如 `createAppVersionNameLoader`），兼顾跨多批复制延迟自动追平与防止已删除历史外键在数百批次中线性空查。
- 同一业务域（如列表与导出）的底层批量查询与统计口径应沉淀在 `entity.ts` 共用，避免在 API 路由层双写导致口径漂移。

```typescript
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';

// ✅ 好的实践：Schema 已强约束为 ObjectId，直接去重回表并用 String(id) 建 Map
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
