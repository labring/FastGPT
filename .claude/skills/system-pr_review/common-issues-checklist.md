# 维度 3: 常见问题检查清单

> 快速识别和修复常见问题模式。这个清单帮助审查者快速发现代码中的典型问题和反模式。

## 目录

- [1. TypeScript 问题](#1-typescript-问题)
- [2. 异步错误处理问题](#2-异步错误处理问题)
- [3. React 性能问题](#3-react-性能问题)
- [4. 工作流节点问题](#4-工作流节点问题)
- [5. 安全漏洞问题](#5-安全漏洞问题)
- [6. 代码重复问题](#6-代码重复问题)
- [7. 环境配置问题](#7-环境配置问题)

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

## 4. 工作流节点问题

### 🔴 4.1 isEntry 标志未重置

**问题识别**:
- 交互节点执行逻辑中第二阶段没有设置 `node.isEntry = false`
- 节点可能重复执行
- 交互节点功能异常

**快速修复**:
```typescript
// ❌ 问题代码
export const dispatchInteractiveNode = async (props: Props) => {
  const { isEntry } = props.node;

  if (!isEntry) {
    return { interactive: { ... } };
  }

  // 处理用户输入
  return { data: { ... } };
  // 忘记重置 isEntry!
};

// ✅ 修复方案
export const dispatchInteractiveNode = async (props: Props) => {
  const { node, lastInteractive } = props;
  const { isEntry } = node;

  // 第一阶段: 返回交互请求
  if (!isEntry || lastInteractive?.type !== 'interactiveType') {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'interactiveType',
        params: { /* ... */ }
      }
    };
  }

  // 第二阶段: 处理用户输入
  node.isEntry = false;  // 🔴 必须: 重置入口标志

  return {
    data: { /* ... */ },
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2)
  };
};
```

**审查建议**: 🔴 严重问题,必须修复

---

### 🔴 4.2 交互历史未清理

**问题识别**:
- 交互节点返回值中没有 `rewriteHistories`
- 用户会看到交互过程中产生的临时消息

**快速修复**:
```typescript
// ❌ 问题代码
export const dispatchInteractiveNode = async (props: Props) => {
  // 处理用户输入后
  return {
    data: { result: userInput }
    // 忘记清理交互对话的历史记录
  };
};

// ✅ 修复方案
export const dispatchInteractiveNode = async (props: Props) => {
  const { histories } = props;

  // 处理用户输入后
  return {
    data: { result: userInput },
    // 移除交互对话的历史记录 (用户问题 + 系统响应 = 2条)
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2)
  };
};
```

**审查建议**: 🔴 严重问题,必须修复

---

### 🔴 4.3 isEntry 白名单遗漏

**问题识别**:
- 新增交互节点但未更新 isEntry 白名单
- 节点在恢复时 isEntry 被重置,导致流程错误

**快速修复**:
```typescript
// ❌ 问题代码
// packages/service/core/workflow/dispatch/index.ts

runtimeNodes.forEach((item) => {
  if (
    item.flowNodeType !== FlowNodeTypeEnum.userSelect &&
    item.flowNodeType !== FlowNodeTypeEnum.formInput
    // 新的交互节点类型未添加到白名单
  ) {
    item.isEntry = false;
  }
});

// ✅ 修复方案
runtimeNodes.forEach((item) => {
  if (
    item.flowNodeType !== FlowNodeTypeEnum.userSelect &&
    item.flowNodeType !== FlowNodeTypeEnum.formInput &&
    item.flowNodeType !== FlowNodeTypeEnum.yourNodeType  // 新增
  ) {
    item.isEntry = false;
  }
});
```

**审查建议**: 🔴 严重问题,必须修复

---

## 5. 安全漏洞问题

### 🔴 5.1 SQL/NoSQL 注入

**问题识别**:
- 用户输入直接用于数据库查询
- 没有输入验证和清理
- 使用字符串拼接构建查询

**快速修复**:
```typescript
// ❌ 问题代码
async function searchUsers(query: string) {
  return await db.users.find({ name: query });
  // 如果 query = { "$gt": "" },会返回所有用户
}

// ✅ 修复方案
async function searchUsers(query: string): Promise<User[]> {
  if (!query || query.length > 100) {
    throw new Error('Invalid query');
  }

  const sanitizedQuery = query.replace(/[^\w\s]/g, '');

  return await db.users.find({
    name: {
      $regex: sanitizedQuery,
      $options: 'i'
    }
  }).limit(10).toArray();
}
```

**审查建议**: 🔴 严重问题,必须修复

---

### 🔴 5.2 XSS 攻击

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

### 🔴 5.3 文件上传漏洞

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

## 6. 代码重复问题

### 🟡 6.1 重复的逻辑

**问题识别**:
- 相同或相似的代码出现在多处
- 复制粘贴的代码
- 修改 bug 时需要改多处

**快速修复**:
```typescript
// ❌ 问题代码
function validateEmail1(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateEmail2(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ✅ 修复方案
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
```

**审查建议**: 🟡 建议改进

---

### 🟡 6.2 重复的组件结构

**问题识别**:
- 多个组件有相似的结构和布局
- 只有细微差别
- 可以抽取共享逻辑或样式

**快速修复**:
```typescript
// ❌ 问题代码
const UserList1 = ({ users }: { users: User[] }) => {
  return (
    <Box p={4} borderWidth="1px" borderRadius="md">
      <VStack spacing={3}>
        {users.map(user => (
          <Box key={user.id} p={3} bg="gray.100">
            <Text>{user.name}</Text>
          </Box>
        ))}
      </VStack>
    </Box>
  );
};

// ✅ 修复方案
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}

const GenericList = <T,>({ items, renderItem }: ListProps<T>) => {
  return (
    <Box p={4} borderWidth="1px" borderRadius="md">
      <VStack spacing={3}>
        {items.map((item, index) => (
          <Box key={index} p={3} bg="gray.100">
            {renderItem(item)}
          </Box>
        ))}
      </VStack>
    </Box>
  );
};

const UserList = ({ users }: { users: User[] }) => {
  return (
    <GenericList
      items={users}
      renderItem={(user) => <Text>{user.name}</Text>}
    />
  );
};
```

**审查建议**: 🟡 建议改进

---

## 7. 环境配置问题

### 🔴 7.1 硬编码配置

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

### 🟡 7.2 环境变量未验证

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
- [ ] 工作流节点 `isEntry` 未重置
- [ ] 硬编码敏感信息
- [ ] SQL/NoSQL 注入漏洞
- [ ] XSS 攻击漏洞
- [ ] 文件上传无验证

### 🟡 建议改进 (推荐修复)

- [ ] 类型定义不完整
- [ ] 错误信息丢失
- [ ] React 不必要的重渲染
- [ ] 环境变量未验证
- [ ] 代码重复

### 🟢 可选优化 (锦上添花)

- [ ] 进一步性能优化
- [ ] 代码简化
- [ ] 类型守卫优化

---

**Version**: 1.0
**Last Updated**: 2026-01-27
**Maintainer**: FastGPT Development Team
