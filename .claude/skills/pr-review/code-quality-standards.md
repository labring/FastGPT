# 维度 1: 代码质量标准

> 通用的代码质量标准,适用于所有项目。这些标准关注代码的正确性、安全性、性能和可维护性。

## 目录

- [1. 安全性标准](#1-安全性标准)
- [2. 正确性标准](#2-正确性标准)
- [3. 性能标准](#3-性能标准)
- [4. 可测试性标准](#4-可测试性标准)
- [5. 可维护性标准](#5-可维护性标准)
- [6. 文档标准](#6-文档标准)

---

## 1. 安全性标准

### 1.1 输入验证 🔴 **必须检查**

**原则**: 永远不要信任用户输入,所有输入必须验证

**检查清单**:
- [ ] 所有用户输入都经过验证和清理
- [ ] 文件上传验证类型、大小、扩展名
- [ ] URL 参数和查询参数验证
- [ ] 使用白名单而不是黑名单
- [ ] 数组/对象参数验证长度和结构

**示例**:
```typescript
// ❌ 不安全: 直接使用用户输入
async function searchUsers(query: string) {
  return await db.users.find({ name: query });
}

// ✅ 安全: 验证和清理输入
async function searchUsers(query: string): Promise<User[]> {
  // 验证输入
  if (!query || query.length > 100) {
    throw new Error('Invalid query parameter');
  }

  // 清理输入: 移除特殊字符
  const sanitizedQuery = query.replace(/[^\w\s]/g, '');

  return await db.users
    .find({
      name: { $regex: sanitizedQuery, $options: 'i' }
    })
    .limit(10)  // 限制结果数量
    .toArray();
}
```

### 1.2 权限检查 🔴 **必须检查**

**原则**: 所有需要授权的操作都必须验证用户权限

**检查清单**:
- [ ] 所有 API 路由都有权限验证
- [ ] 验证用户对资源的所有权
- [ ] 敏感操作需要额外验证 (2FA, 确认密码)
- [ ] 遵循最小权限原则

**示例**:
```typescript
// ❌ 不安全: 没有权限验证
export default async function handler(req: NextAPIRequest, res: NextAPIResponse) {
  const userId = req.body.userId;
  const user = await db.users.findById(userId);
  res.json(user);
}

// ✅ 安全: 验证权限
import { parseHeaderCert } from '@fastgpt/global/support/permission/controller';

export default async function handler(req: NextAPIRequest, res: NextAPIResponse) {
  // 1. 验证身份
  const { userId: authUserId } = await parseHeaderCert(req);

  // 2. 验证权限 (只能访问自己的数据)
  const requestedUserId = req.body.userId;

  // 管理员可以访问所有用户,普通用户只能访问自己
  if (authUserId !== requestedUserId && !isAdmin(authUserId)) {
    throw new Error('Permission denied');
  }

  const user = await db.users.findById(requestedUserId);

  // 3. 过滤敏感字段
  const { password, ...safeUser } = user;
  res.json(safeUser);
}
```

### 1.3 注入防护 🔴 **必须检查**

**原则**: 防止 SQL/NoSQL 注入、命令注入、XSS 等攻击

**检查清单**:
- [ ] 使用参数化查询,不拼接字符串
- [ ] 避免直接使用 `eval` 或 `Function` 构造函数
- [ ] 对用户输出进行 HTML 转义
- [ ] 使用 DOMPurify 等库清理 HTML

**示例**:
```typescript
// ❌ NoSQL 注入风险
async function findUser(query: any) {
  return await db.users.findOne(query);
  // 如果 query = { "$gt": "" }, 会返回所有用户
}

// ✅ 使用参数化和验证
async function findUser(email: string): Promise<User | null> {
  // 验证 email 格式
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email format');
  }

  return await db.users.findOne({ email });
}
```

### 1.4 敏感信息保护 🔴 **必须检查**

**原则**: 不要在代码中硬编码敏感信息,不要在日志中暴露敏感数据

**检查清单**:
- [ ] 无硬编码的密钥、token、密码
- [ ] 敏感信息使用环境变量
- [ ] 错误日志不包含敏感信息
- [ ] API 响应过滤敏感字段
- [ ] 密码使用哈希存储

**示例**:
```typescript
// ❌ 不安全: 硬编码密钥
const API_KEY = 'sk-1234567890abcdef';
const DB_PASSWORD = 'mypassword';

// ✅ 安全: 使用环境变量
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  throw new Error('OPENAI_API_KEY is required');
}

// ❌ 不安全: 日志包含敏感信息
console.log('User logged in:', {
  userId: user.id,
  email: user.email,
  password: user.password  // 密码被记录!
});

// ✅ 安全: 过滤敏感字段
const { password, ...safeUser } = user;
console.log('User logged in:', {
  userId: safeUser.id,
  email: safeUser.email
});
```

---

## 2. 正确性标准

### 2.1 错误处理 🔴 **必须检查**

**原则**: 所有可能失败的操作都必须有错误处理

**检查清单**:
- [ ] 所有 async/await 都有 try-catch
- [ ] Promise 都有 .catch() 处理
- [ ] 错误信息清晰且有用
- [ ] 区分业务错误和系统错误
- [ ] 错误日志包含上下文信息

**示例**:
```typescript
// ❌ 不好的错误处理
async function deleteUser(userId: string) {
  await db.users.deleteOne({ id: userId });
  // 没有错误处理,如果用户不存在会怎样?
}

// ✅ 好的错误处理
async function deleteUser(userId: string): Promise<void> {
  try {
    const result = await db.users.deleteOne({ id: userId });

    if (result.deletedCount === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    console.log(`User ${userId} deleted successfully`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to delete user ${userId}:`, error);
      throw new Error(`Delete user failed: ${error.message}`);
    }
    throw error;
  }
}
```

### 2.2 类型安全 🟡 **推荐检查**

**原则**: 充分利用 TypeScript 类型系统,避免类型错误

**检查清单**:
- [ ] 避免使用 `any` 类型
- [ ] 函数参数和返回值有明确的类型
- [ ] 复杂类型使用 interface 或 type 定义
- [ ] 使用类型守卫而不是类型断言
- [ ] 启用 strict 模式

**示例**:
```typescript
// ❌ 不好的类型使用
async function fetchData(id: any): any {
  const result: any = await db.collection('data').findOne({ id });
  return result;
}

// ✅ 好的类型使用
interface UserData {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

async function fetchData(id: string): Promise<UserData | null> {
  const result = await db.collection<UserData>('data').findOne({ id });
  return result;
}
```

### 2.3 边界条件 🟡 **推荐检查**

**原则**: 考虑边界情况和异常输入

**检查清单**:
- [ ] 空值处理 (null, undefined, '')
- [ ] 空数组/空对象处理
- [ ] 极限值处理 (0, 最大值, 最小值)
- [ ] 并发和竞争条件
- [ ] 资源耗尽情况

**示例**:
```typescript
// ❌ 未处理边界条件
function getFirstItem<T>(items: T[]): T {
  return items[0];  // 如果数组为空会返回 undefined
}

// ✅ 处理边界条件
function getFirstItem<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items[0];
}

// 或使用可选链
function getFirstItem<T>(items: T[]): T | undefined {
  return items[0];
}

// 使用时
const first = getFirstItem(items);
if (first) {
  // 安全使用 first
}
```

---

## 3. 性能标准

### 3.1 算法复杂度 🟡 **推荐检查**

**原则**: 避免不必要的嵌套循环,使用合适的数据结构

**检查清单**:
- [ ] 避免嵌套循环 (O(n²) 或更差)
- [ ] 大数据集使用合适的算法
- [ ] 使用 Set/Map 优化查找操作
- [ ] 分页处理大数据集

**示例**:
```typescript
// ❌ 性能问题: O(n²)
function findDuplicates(arr: string[]): string[] {
  const duplicates: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}

// ✅ 优化后: O(n)
function findDuplicates(arr: string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.push(item);
    } else {
      seen.add(item);
    }
  }

  return duplicates;
}
```

### 3.2 数据库查询 🟡 **推荐检查**

**原则**: 避免 N+1 查询,使用索引优化查询

**检查清单**:
- [ ] 避免 N+1 查询问题
- [ ] 使用索引优化查询
- [ ] 只查询需要的字段
- [ ] 使用分页 (skip + limit)
- [ ] 批量操作使用 bulkWrite

**示例**:
```typescript
// ❌ N+1 查询问题
const users = await db.users.find({}).toArray();
for (const user of users) {
  const posts = await db.posts.find({ userId: user.id }).toArray();
  user.posts = posts;
}

// ✅ 使用 $in 操作
const users = await db.users.find({}).toArray();
const userIds = users.map(u => u.id);
const posts = await db.posts.find({ userId: { $in: userIds } }).toArray();

// 构建映射
const postsByUser = new Map<string, Post[]>();
posts.forEach(post => {
  if (!postsByUser.has(post.userId)) {
    postsByUser.set(post.userId, []);
  }
  postsByUser.get(post.userId)!.push(post);
});

// 关联数据
users.forEach(user => {
  user.posts = postsByUser.get(user.id) || [];
});
```

### 3.3 内存管理 🟢 **可选检查**

**原则**: 避免内存泄漏,及时清理资源

**检查清单**:
- [ ] 避免内存泄漏 (事件监听器、定时器)
- [ ] 及时清理不再使用的大对象
- [ ] 使用流处理大文件
- [ ] 避免不必要的闭包

---

## 4. 可测试性标准

### 4.1 测试覆盖 🟡 **推荐检查**

**原则**: 新功能必须有测试,核心功能要有充分测试

**检查清单**:
- [ ] 新功能有对应的单元测试
- [ ] 核心业务逻辑有集成测试
- [ ] 关键路径有 E2E 测试
- [ ] 测试覆盖主要场景 (正常和异常)

**示例**:
```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user successfully with valid data', async () => {
      // Arrange
      const userData = {
        name: 'Test User',
        email: 'test@example.com'
      };

      // Act
      const user = await createUser(userData);

      // Assert
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.name).toBe(userData.name);
    });

    it('should throw error with duplicate email', async () => {
      // Arrange
      const userData = {
        name: 'Test User',
        email: 'existing@example.com'
      };
      await createUser(userData);

      // Act & Assert
      await expect(createUser(userData)).rejects.toThrow('Duplicate email');
    });

    it('should throw error with invalid email', async () => {
      // Arrange
      const userData = {
        name: 'Test User',
        email: 'invalid-email'
      };

      // Act & Assert
      await expect(createUser(userData)).rejects.toThrow('Invalid email');
    });
  });
});
```

### 4.2 测试质量 🟢 **可选检查**

**原则**: 测试应该是独立的、可重复的、快速的

**检查清单**:
- [ ] 测试用例独立,不依赖执行顺序
- [ ] 测试用例可重复执行
- [ ] 测试运行快速 (隔离慢操作)
- [ ] 测试命名清晰描述测试意图
- [ ] 使用 AAA 模式 (Arrange, Act, Assert)

---

## 5. 可维护性标准

### 5.1 代码组织 🟡 **推荐检查**

**原则**: 代码应该易于理解、修改和扩展

**检查清单**:
- [ ] 函数/模块职责单一
- [ ] 代码重复已抽取
- [ ] 函数长度合理 (一般 < 50 行)
- [ ] 文件结构清晰
- [ ] 命名清晰表达意图

**示例**:
```typescript
// ❌ 职责不单一,函数过长
async function processUser(userId: string) {
  const user = await db.users.findById(userId);
  if (!user) throw new Error('User not found');

  const orders = await db.orders.find({ userId }).toArray();
  const totalAmount = orders.reduce((sum, order) => sum + order.amount, 0);

  const recommendations = await generateRecommendations(user);
  const notifications = await buildNotifications(user, recommendations);

  await sendEmail(user.email, notifications);
  await updateLastLogin(userId);

  return { user, orders, totalAmount, recommendations };
}

// ✅ 职责单一,易于测试
async function getUserProfile(userId: string) {
  const user = await db.users.findById(userId);
  if (!user) throw new Error('User not found');
  return user;
}

async function getUserOrders(userId: string) {
  return await db.orders.find({ userId }).toArray();
}

async function calculateTotalAmount(orders: Order[]) {
  return orders.reduce((sum, order) => sum + order.amount, 0);
}

async function processUser(userId: string) {
  const user = await getUserProfile(userId);
  const orders = await getUserOrders(userId);
  const totalAmount = calculateTotalAmount(orders);

  return { user, orders, totalAmount };
}
```

### 5.2 命名规范 🟢 **可选检查**

**原则**: 命名应该清晰表达意图,遵循团队约定

**检查清单**:
- [ ] 变量名清晰表达用途
- [ ] 函数名使用动词开头
- [ ] 布尔值变量使用 is/has/should 前缀
- [ ] 常量使用 UPPER_SNAKE_CASE
- [ ] 类/接口使用 PascalCase

**示例**:
```typescript
// ❌ 不好的命名
const d = new Date();
const temp1 = getUser();
const flag = checkUser();

// ✅ 好的命名
const currentDate = new Date();
const currentUser = getUser();
const isAuthenticated = checkUser();
```

---

## 6. 文档标准

### 6.1 注释质量 🟢 **可选检查**

**原则**: 注释应该解释"为什么"而不是"是什么"

**检查清单**:
- [ ] 复杂逻辑有清晰注释
- [ ] 注释解释设计决策
- [ ] 公共 API 有 JSDoc 注释
- [ ] TODO/FIXME 有跟踪 issue

**示例**:
```typescript
// ❌ 不好的注释: 重复代码
// 获取用户
const user = await getUser(userId);

// ✅ 好的注释: 解释原因
// 使用缓存避免重复查询数据库
const user = await getUserWithCache(userId);

// ❌ 不好的注释: 没有解释
// 重试 3 次
for (let i = 0; i < 3; i++) {
  try {
    return await operation();
  } catch (error) {
    // 继续尝试
  }
}

// ✅ 好的注释: 解释设计决策
// 重试 3 次处理临时网络故障
// 使用指数退避避免服务器过载
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    return await operation();
  } catch (error) {
    if (attempt === 3) throw error;
    await sleep(Math.pow(2, attempt) * 1000);
  }
}
```

### 6.2 API 文档 🔴 **必选检查**

所有修改到的 API 都需要用 zod 来进行类型声明以及编写对应的 OpenAPI 文档。

参考: [api-development.md](../common/skills/api-development/SKILL.md)

---

## 快速检查表

### 🔴 必须检查项 (阻塞性)

- [ ] **输入验证**: 所有用户输入都经过验证
- [ ] **权限验证**: API 路由都有权限检查
- [ ] **注入防护**: 使用参数化查询
- [ ] **敏感信息**: 无硬编码密钥
- [ ] **错误处理**: 所有异步操作有错误处理

### 🟡 推荐检查项 (建议性)

- [ ] **类型安全**: 避免使用 `any`
- [ ] **边界条件**: 处理空值和边界情况
- [ ] **算法复杂度**: 避免嵌套循环
- [ ] **数据库查询**: 避免 N+1 查询
- [ ] **测试覆盖**: 新功能有测试
- [ ] **代码组织**: 职责单一,无重复代码

### 🟢 可选检查项 (优化性)

- [ ] **命名规范**: 命名清晰表达意图
- [ ] **注释质量**: 复杂逻辑有注释
- [ ] **API 文档**: 公共 API 有 JSDoc
- [ ] **内存管理**: 避免内存泄漏

---

**Version**: 1.0
**Last Updated**: 2026-01-27
**Maintainer**: FastGPT Development Team
