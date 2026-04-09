# 维度 3: 常见问题检查清单

> 快速识别和修复常见问题模式。这个清单帮助审查者快速发现代码中的典型问题和反模式。

## 目录

- [1. TypeScript 问题](#1-typescript-问题)
- [2. 异步错误处理问题](#2-异步错误处理问题)
- [3. React 性能问题](#3-react-性能问题)
- [4. 安全漏洞问题](#5-安全漏洞问题)
- [5. 环境配置问题](#7-环境配置问题)

---

## 1. TypeScript 问题

### 🔴 1.1 滥用 any 类型

**问题识别**:
- 变量声明为 `any` 类型
- 函数参数或返回值使用 `any`
- 类型断言过度使用

**快速修复**:
```typescript
// ❌ 问题代码
async function fetchData(id: any): any {
  const result: any = await db.collection('data').findOne({ id });
  return result;
}

// ✅ 修复方案
interface UserData {
  id: string;
  name: string;
  email: string;
}

async function fetchData(id: string): Promise<UserData | null> {
  const result = await db.collection<UserData>('data').findOne({ id });
  return result;
}
```

**审查建议**: 🔴 严重问题,必须修复

---

### 🟡 1.2 类型定义不完整

**问题识别**:
- 使用 `object` 作为类型
- 参数结构不明确
- 缺少必要的类型定义

**快速修复**:
```typescript
// ❌ 问题代码
function updateUser(id: string, data: object) {
  return db.users.updateOne({ id }, { $set: data });
}

// ✅ 修复方案
type UpdateUserData = {
  name?: string;
  email?: string;
  avatar?: string;
};

function updateUser(id: string, data: UpdateUserData) {
  return db.users.updateOne({ id }, { $set: data });
}
```

**审查建议**: 🟡 建议改进

---

### 🟡 1.3 不安全的类型断言

**问题识别**:
- 双重断言 (`as any as Type`)
- 断言后没有验证
- 过度依赖类型断言

**快速修复**:
```typescript
// ❌ 问题代码
const value = data as any as User;

// ✅ 修复方案 1: 类型守卫
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value
  );
}

if (isUser(data)) {
  // 安全使用 data 作为 User
}

// ✅ 修复方案 2: 使用 zod 验证
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string()
});

const result = UserSchema.parse(data);
```

**审查建议**: 🟡 建议改进

---

## 2. 异步错误处理问题

### 🔴 2.1 未处理的 Promise rejection

**问题识别**:
- async 函数没有 try-catch
- 没有 .catch() 处理
- 错误可能静默失败

**快速修复**:
```typescript
// ❌ 问题代码
async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return data;
}

// ✅ 修复方案
async function fetchUserData(userId: string): Promise<UserData> {
  try {
    const response = await fetch(`/api/users/${userId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to fetch user ${userId}:`, error);
      throw new Error(`User fetch failed: ${error.message}`);
    }
    throw error;
  }
}
```

**审查建议**: 🔴 严重问题,必须修复

---

### 🟡 2.2 错误信息丢失

**问题识别**:
- catch 中创建新的错误但不保留原始错误
- 错误日志信息不完整
- 难以调试和追踪问题

**快速修复**:
```typescript
// ❌ 问题代码
async function saveUser(user: User) {
  try {
    await db.users.insertOne(user);
  } catch (error) {
    throw new Error('Save failed');  // 原始错误丢失
  }
}

// ✅ 修复方案
async function saveUser(user: User) {
  try {
    await db.users.insertOne(user);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Database error:', error);
      throw new Error(`Save user failed: ${error.message}`, {
        cause: error
      });
    }
    throw error;
  }
}
```

**审查建议**: 🟡 建议改进

---

### 🟡 2.3 静默忽略错误

**问题识别**:
- 空的 catch 块
- 使用 void 忽略 Promise
- 没有说明原因的忽略

**快速修复**:
```typescript
// ❌ 问题代码
async function cleanup() {
  try {
    await deleteTempFiles();
  } catch (error) {
    // 空的 catch,错误被忽略
  }
}

// ✅ 修复方案
async function cleanup() {
  try {
    await deleteTempFiles();
  } catch (error) {
    // 至少记录错误日志
    console.error('Cleanup failed:', error);
    // 如果确实需要忽略,添加注释说明原因
    // 错误被忽略是因为清理失败不应影响主流程
  }
}
```

**审查建议**: 🟡 建议改进 (必须有明确的注释说明)

---

## 3. React 性能问题

### 🟢 3.1 不必要的组件重渲染

**问题识别**:
- 父组件状态变化导致子组件不必要的重渲染
- 子组件是昂贵的计算或渲染
- 没有使用 React.memo

**快速修复**:
```typescript
// ❌ 问题代码
const Parent = ({ items }: { items: Item[] }) => {
  const [count, setCount] = useState(0);

  return (
    <>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      {items.map(item => (
        <ExpensiveChild data={item} key={item.id} />
      ))}
    </>
  );
};

// ✅ 修复方案
const ExpensiveChild = React.memo(function ExpensiveChild({ data }: { data: Item }) {
  // 昂贵的计算或渲染
  return <div>{/* ... */}</div>;
});

const Parent = ({ items }: { items: Item[] }) => {
  const [count, setCount] = useState(0);

  return (
    <>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      {items.map(item => (
        <ExpensiveChild data={item} key={item.id} />
      ))}
    </>
  );
};
```

**审查建议**: 🟢 可选优化

---

### 🟡 3.2 渲染中创建新对象/函数

**问题识别**:
- JSX 中使用箭头函数
- JSX 中创建对象字面量
- 导致子组件不必要的重渲染

**快速修复**:
```typescript
// ❌ 问题代码
const MyComponent = ({ items }: { items: Item[] }) => {
  return (
    <>
      {items.map(item => (
        <Child
          key={item.id}
          data={item}
          onClick={() => handleClick(item.id)}  // 每次渲染创建新函数
          options={{ enable: true, mode: 'edit' }}  // 每次渲染创建新对象
        />
      ))}
    </>
  );
};

// ✅ 修复方案
const MyComponent = ({ items }: { items: Item[] }) => {
  const handleClick = useCallback((id: string) => {
    // 处理逻辑
  }, []);

  const options = useMemo(() => ({
    enable: true,
    mode: 'edit'
  }), []);

  return (
    <>
      {items.map(item => (
        <Child
          key={item.id}
          data={item}
          onClick={() => handleClick(item.id)}
          options={options}
        />
      ))}
    </>
  );
};
```

**审查建议**: 🟡 建议改进

---

### 🟡 3.3 昂贵计算未缓存

**问题识别**:
- 复杂的数组操作 (sort, filter, map 链式调用)
- 每次渲染都重新计算
- 计算结果在渲染间不变

**快速修复**:
```typescript
// ❌ 问题代码
const ExpensiveList = ({ items }: { items: Item[] }) => {
  // 每次渲染都重新计算
  const sortedItems = items.sort((a, b) => a.value - b.value);
  const filteredItems = sortedItems.filter(item => item.active);

  return <ul>{filteredItems.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
};

// ✅ 修复方案
const ExpensiveList = ({ items }: { items: Item[] }) => {
  const sortedItems = useMemo(() =>
    [...items].sort((a, b) => a.value - b.value),
    [items]
  );

  const filteredItems = useMemo(() =>
    sortedItems.filter(item => item.active),
    [sortedItems]
  );

  return <ul>{filteredItems.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
};
```

**审查建议**: 🟡 建议改进

---


## 4. 安全漏洞问题

### 🔴 4.1 NoSQL 注入 (接口入参风险)

**核心风险**: MongoDB 查询操作符 (`$gt`、`$where`、`$regex`、`$ne` 等) 可以通过 HTTP 请求体注入。当接口直接将入参透传到数据库查询时,攻击者可以构造恶意对象绕过权限校验或泄露数据。

**典型攻击场景**:
```
// 攻击者发送的请求体
POST /api/login
{ "username": { "$gt": "" }, "password": { "$gt": "" } }
// → MongoDB 查询变为 { username: { $gt: "" }, password: { $gt: "" } }
// → 匹配所有用户,绕过密码校验
```

**问题识别**:
- 接口入参未经 zod/类型校验直接传入查询条件
- 查询字段类型声明为 `any` 或 `object`
- 使用 `req.body.xxx` 直接拼入 `find()`、`findOne()`、`updateOne()` 等
- 动态构建查询对象时未限制字段类型为原始值

**高危模式**:
```typescript
// ❌ 危险: 入参直接作为查询字段值
const { username, password } = req.body;
await db.users.findOne({ username, password });

// ❌ 危险: 对象字段透传进查询
async function getUser({ filter }: { filter: object }) {
  return db.users.findOne(filter);  // filter 可以是任意操作符
}

// ❌ 危险: updateOne 条件字段未校验
await db.collection.updateOne(
  { _id: req.body.id },           // id 可能是 { $gt: "" }
  { $set: req.body.update }       // update 可能注入 $where 等
);
```

**快速修复**:
```typescript
// ✅ 方案 1: zod schema 严格约束入参类型(推荐)
import { z } from 'zod';

const LoginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(100)
});

async function login(req: Request) {
  // parse 失败直接抛出,不会进入查询逻辑
  const { username, password } = LoginSchema.parse(req.body);
  return db.users.findOne({ username, password });
}

// ✅ 方案 2: 显式提取原始值,拒绝对象类型
async function searchUsers(query: unknown): Promise<User[]> {
  if (typeof query !== 'string' || query.length > 100) {
    throw new Error('Invalid query');
  }
  return db.users.find({
    name: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  }).limit(10).toArray();
}

// ✅ 方案 3: 动态查询条件使用白名单字段
const ALLOWED_FILTER_FIELDS = ['status', 'type', 'teamId'] as const;

function buildSafeFilter(raw: Record<string, unknown>) {
  return ALLOWED_FILTER_FIELDS.reduce((acc, key) => {
    if (raw[key] !== undefined && typeof raw[key] === 'string') {
      acc[key] = raw[key];
    }
    return acc;
  }, {} as Record<string, string>);
}
```

**审查重点**:
- [ ] 所有接口入参是否经过 zod schema 或等效校验
- [ ] 查询条件字段是否均为原始类型 (`string`、`number`、`boolean`)
- [ ] 是否存在将 `req.body` 的对象字段直接传入 MongoDB 操作符位置的情况
- [ ] `_id` 字段是否使用 `new Types.ObjectId(id)` 强制转换

**审查建议**: 🔴 严重问题,必须修复

---

### 🔴 4.2 XSS 攻击

**问题识别**:
- 使用 `dangerouslySetInnerHTML`
- 用户输入直接渲染到 HTML
- 没有 HTML 转义

**快速修复**:
```typescript
// ❌ 问题代码
const UserProfile = ({ user }: { user: User }) => {
  return (
    <div>
      <h1>{user.name}</h1>
      <p dangerouslySetInnerHTML={{ __html: user.bio }} />
    </div>
  );
};

// ✅ 修复方案
import DOMPurify from 'dompurify';

const UserProfile = ({ user }: { user: User }) => {
  const cleanBio = DOMPurify.sanitize(user.bio);

  return (
    <div>
      <h1>{user.name}</h1>
      <p dangerouslySetInnerHTML={{ __html: cleanBio }} />
    </div>
  );
};

// 或更安全的方案
const UserProfile = ({ user }: { user: User }) => {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.bio}</p>  // React 自动转义
    </div>
  );
};
```

**审查建议**: 🔴 严重问题,必须修复

---

### 🔴 4.3 文件上传漏洞

**问题识别**:
- 没有文件类型验证
- 没有文件大小限制
- 没有扩展名白名单

**快速修复**:
```typescript
// ❌ 问题代码
app.post('/upload', async (req, res) => {
  const file = req.body.file;
  await fs.writeFile(`/uploads/${file.name}`, file.data);
  res.json({ success: true });
});

// ✅ 修复方案
import { extname } from 'path';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

app.post('/upload', async (req, res) => {
  const file = req.body.file;

  // 验证文件大小
  if (file.size > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File too large' });
  }

  // 验证 MIME 类型
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Invalid file type' });
  }

  // 验证扩展名
  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(400).json({ error: 'Invalid file extension' });
  }

  const safeName = `${Date.now()}-${Math.random().toString(36).substr(2)}${ext}`;
  await fs.writeFile(`/uploads/${safeName}`, file.data);

  res.json({ success: true, filename: safeName });
});
```

**审查建议**: 🔴 严重问题,必须修复

---


## 5. 环境配置问题

### 🔴 5.1 硬编码配置

**问题识别**:
- 配置值直接写在代码中
- 密钥、token 硬编码
- 不同环境无法灵活配置

**快速修复**:
```typescript
// ❌ 问题代码
const API_KEY = 'sk-1234567890abcdef';
const DB_URL = 'mongodb://localhost:27017/myapp';

// ✅ 修复方案
const API_KEY = process.env.OPENAI_API_KEY;
const DB_URL = process.env.MONGODB_URL;

if (!API_KEY) {
  throw new Error('OPENAI_API_KEY is required');
}
```

**审查建议**: 🔴 严重问题 (特别是敏感信息),必须修复

---

### 🟡 5.2 环境变量未验证

**问题识别**:
- 直接使用环境变量而不验证
- 没有默认值或类型转换
- 缺少必需的环境变量检查

**快速修复**:
```typescript
// ❌ 问题代码
const config = {
  apiKey: process.env.API_KEY,
  port: parseInt(process.env.PORT),
  debug: process.env.DEBUG === 'true'
};

// ✅ 修复方案
const getConfig = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY environment variable is required');
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port)) {
    throw new Error('PORT must be a valid number');
  }

  return {
    apiKey,
    port,
    debug: process.env.DEBUG === 'true'
  };
};

const config = getConfig();
```

**审查建议**: 🟡 建议改进

---

## 快速识别检查表

### 🔴 严重问题 (必须修复)

- [ ] 滥用 `any` 类型
- [ ] 未处理的 Promise rejection
- [ ] 硬编码敏感信息
- [ ] SQL/NoSQL 注入漏洞
- [ ] XSS 攻击漏洞
- [ ] 文件上传无验证

### 🟡 建议改进 (推荐修复)

- [ ] 类型定义不完整
- [ ] 错误信息丢失
- [ ] React 不必要的重渲染
- [ ] 环境变量未验证

### 🟢 可选优化 (锦上添花)

- [ ] 进一步性能优化
- [ ] 代码简化
- [ ] 类型守卫优化

---

**Version**: 1.0
**Last Updated**: 2026-01-27
**Maintainer**: FastGPT Development Team
