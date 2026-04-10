# 前端 TypeScript 质量检查标准

## 1. any 类型滥用 🔴

`any` 类型会关闭 TypeScript 的类型检查，使得类型错误只能在运行时暴露，而非编译时发现。

**识别信号**：
- 变量、参数、返回值声明为 `any`
- 使用 `as any` 进行类型断言
- API 响应数据直接使用，无类型约束

```typescript
// ❌ any 让类型系统形同虚设
async function fetchData(id: any): any {
  const result: any = await db.collection('data').findOne({ id });
  return result;
}

// ✅ 明确的类型定义
type UserData = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

async function fetchData(id: string): Promise<UserData | null> {
  const result = await db.collection<UserData>('data').findOne({ id });
  return result;
}
```

**例外情况**：
- 第三方库确实没有类型定义时，可以用 `unknown` 代替 `any`，然后通过类型守卫收窄
- 临时调试代码（但合并前必须移除）

---

## 2. 不安全的类型断言 🟡

类型断言（`as Type`）绕过了编译器检查，如果断言错误，运行时会产生难以调试的问题。

```typescript
// ❌ 双重断言（最危险，完全跳过类型检查）
const user = data as any as User;

// ❌ 无根据的断言（data 可能不是 User）
const user = data as User;
user.profile.avatar;  // 如果 data 不符合 User 结构，运行时报错

// ✅ 使用类型守卫（编译时 + 运行时都安全）
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as User).id === 'string'
  );
}

if (isUser(data)) {
  console.log(data.id);  // 安全
}

// ✅ 使用 zod 验证外部数据（API 响应、localStorage 读取等）
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email()
});

const user = UserSchema.parse(apiResponse);  // 解析失败自动抛出
```

---

## 3. 类型定义不完整 🟡

使用 `object`、`{}` 或过于宽泛的联合类型，导致 TypeScript 无法提供有效的自动补全和错误提示。

```typescript
// ❌ object 类型无任何约束
function updateUser(id: string, data: object) {
  return db.users.updateOne({ id }, { $set: data });
}

// ❌ 函数参数数量超过2个，未用对象收拢
function createItem(name: string, type: string, teamId: string, createdBy: string) {
  // ...
}

// ✅ 明确类型定义
type UpdateUserData = {
  name?: string;
  email?: string;
  avatar?: string;
};
function updateUser(id: string, data: UpdateUserData) {
  return db.users.updateOne({ id }, { $set: data });
}

// ✅ 多参数用对象收拢（FastGPT 规范：超过2个参数必须用对象）
type CreateItemParams = {
  name: string;
  type: string;
  teamId: string;
  createdBy: string;
};
function createItem({ name, type, teamId, createdBy }: CreateItemParams) {
  // ...
}
```

---

## 4. 非空断言过度使用 🟡

非空断言（`!`）告诉 TypeScript"这个值不可能是 null/undefined"，如果判断错误，会在运行时抛出 `Cannot read properties of null`。

```typescript
// ❌ 危险：如果 user 为 null，运行时崩溃
const email = user!.email;
const name = data!.profile!.name;

// ✅ 方案1：提前校验
if (!user) throw new Error('User not found');
const email = user.email;  // 此后 TypeScript 知道 user 非空

// ✅ 方案2：可选链（不确定是否存在时）
const name = data?.profile?.name ?? 'Unknown';

// ✅ 方案3：只在确实不可能为空的地方使用（需加注释说明原因）
// teamId 在此处由 authMiddleware 保证非空
const teamId = req.headers.teamId!;
```

---

## 快速检查表

| 检查项 | 级别 |
|--------|------|
| 无 `any` 类型声明 | 🔴 |
| 无 `as any as Type` 双重断言 | 🔴 |
| 函数参数有明确类型约束 | 🟡 |
| 超过2个参数使用对象收拢 | 🟡 |
| `!` 非空断言有校验或注释支撑 | 🟡 |
| 外部数据（API响应）经过 zod 或类型守卫处理 | 🟡 |
