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
