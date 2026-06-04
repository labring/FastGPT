# 代码规范

## 基础代码组织模式

采用 DDD 架构，按业务域 → 子功能 → 固定文件三层划分。

### 目录结构

```
packages/
├── global/core/              # 类型、常量（前后端共享）
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
    ├── app/
    │   ├── schema.ts         # App 主表 Mongoose Schema
    │   ├── entity.ts         # findById / create / updateById 等基础操作封装
    │   ├── service.ts        # 聚合业务逻辑（跨子功能协调），不允许互相引用，只允许单向依赖，跨 service 的协调需由上层通过 props 传入另一个 service 或者衍生方法
    │   ├── auth.ts           # 鉴权相关（如有）
    │   ├── utils.ts          # 纯函数工具，无副作用，可独立单测
    │   ├── version/
    │   │   ├── schema.ts
    │   │   ├── entity.ts
    │   │   ├── service.ts
    │   │   └── utils.ts
    │   ├── evaluation/
    │   │   ├── schema.ts     # 合并多个 schema 到单文件
    │   │   ├── entity.ts
    │   │   ├── service.ts
    │   │   └── utils.ts
    │   ├── logs/
    │   └── tool/
    │       ├── service.ts
    │       └── utils.ts
    ├── chat/
    ├── dataset/
    └── plugin/
```

### 叶子目录固定文件说明

| 文件 | 职责 |
|------|------|
| `schema.ts` | Mongoose Schema 定义，导出 Model 和 SchemaType |
| `entity.ts` | 数据访问封装：`findById`、`create`、`updateById` 等基础操作 |
| `service.ts` | 业务逻辑：调用 entity，跨模块协调，处理业务规则 |
| `utils.ts` | 纯函数工具，无副作用，可独立单测 |

```typescript
// entity.ts 示例 —— 只做数据访问，不含业务判断
export const findAppById = (id: string) =>
  MongoApp.findById(id).lean();
export const createApp = (data: AppCreateParams, session?: ClientSession) =>
  MongoApp.create([data], { session });

// service.ts 示例 —— 调用 entity，处理业务规则
export const createAppAndInitVersion = async (data: AppCreateParams, session?: ClientSession) => {
  const app = await createApp(data, session);
  await createVersion({ appId: app._id, ... }, session);
  return app;
};

// service 需协同，通过 props 传入另一个 service 或者衍生方法。
const service1 = xxxx
const service2 = (props: {id:string; service1: typeof service1 }) => {
  const data = findAppById(id)
  return props.service1(data);
};
```

### 层级约束

- `global/core/` 只放类型和常量，**禁止**引入 mongoose、服务端 SDK
- `service/core/` 只在服务端使用，**禁止**被 `packages/web/` 或前端页面直接引用
- 子功能目录不超过 **3 层**嵌套
- 一个目录内无需拆子功能时，直接放 `schema.ts` + `entity.ts` + `service.ts` + `utils.ts`
- 多个 schema 文件（如 `evalSchema.ts` + `evalItemSchema.ts`）**合并**到单个 `schema.ts`

## 代码风格
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

---

### 使用 IIFE 写法来取代 if/else 进行变量条件赋值。

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

---

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

---

### Zod Schema 与 OpenAPI 风格

Zod schema 同时承担运行时校验、TypeScript 类型推导和 OpenAPI 生成来源。新增或调整 API 时，按下面规则组织：

- 业务通用结构放在业务归属目录，例如 `packages/global/core/app/type.ts`、`packages/global/core/workflow/type/node.ts`、`packages/global/support/permission/**/controller.ts`。`packages/global/openapi/**` 只声明接口 query/body/response/path、接口专用兼容处理和 OpenAPI 文档信息，不把通用配置类型、权限对象、工具配置等只为文档复制到 openapi 目录。
- OpenAPI schema 优先复用业务 schema。需要字段说明时，优先在业务 schema 上补齐 `meta`；只属于某个接口视角的说明，可以在 openapi schema 里用 `SomeSchema.shape.field.meta(...)` 补充。不要重复建立同构 schema，也不要用 `export const A = B` 这种重命名 alias 当作新 schema 导出。
- 只有接口边界确实需要特殊兼容时，才在 openapi 目录定义专用 wrapper，例如把 `{}` 兼容为 `undefined`、或去掉 JSON Schema 不支持的 function 字段。此类 wrapper 附近要写清楚原因。
- API response schema 默认声明业务 `data` 结构，不重复声明统一响应 envelope，例如 `code`、`statusText`。只有路由实际直接返回这些字段时，才把它们写进 schema。
- 没有业务返回数据的成功响应，schema 用 `z.undefined().meta({ description: '操作成功' })`，handler 里返回 `SomeResponseSchema.parse(undefined)`，或在没有 response schema 的旧路由里直接不写 `return`。不要再写 `z.null()`、`z.object({})`、`return null`、`return {}` 或 `return 'success'` 表示空成功响应；统一响应中间件会把 `undefined` 包成 `data: null`。
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

---

## 可选链调用回调

用 `?.()` 调用可选回调，取代 `if (fn) fn()` 的冗余写法。

```typescript
// ❌ 不好的实践
if (onProgress) {
  onProgress({ phase: 'creatingContainer' });
}

// ✅ 好的实践
onProgress?.({ phase: 'creatingContainer' });
```

---

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

---

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

---

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

---

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

---

### 函数参数不超过 2 个，多参数用对象传递

独立参数不超过 2 个，超过时改为对象参数，便于扩展且无需关心顺序。

```typescript
// ❌ 不好的实践
function createVersion(skillId: string, teamId: string, tmbId: string, version: number) {}

// ✅ 好的实践
function createVersion(data: { skillId: string; teamId: string; tmbId: string; version: number }) {}
```

---

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
