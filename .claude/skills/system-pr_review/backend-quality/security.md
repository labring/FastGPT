# 后端安全检查标准

## 1. NoSQL 注入 🔴

**核心风险**：MongoDB 操作符（`$gt`、`$where`、`$regex`、`$ne` 等）可通过 HTTP 请求体注入。接口将入参直接透传到查询条件时，攻击者可绕过权限校验或泄露数据。

**典型攻击**：
```
POST /api/login
{ "username": { "$gt": "" }, "password": { "$gt": "" } }
→ db.users.findOne({ username: { $gt: "" }, password: { $gt: "" } })
→ 匹配所有用户，绕过密码校验
```

**高危模式**：
```typescript
// ❌ 入参直接作为查询条件
const { username, password } = req.body;
await db.users.findOne({ username, password });

// ❌ 对象字段透传进查询
async function getUser({ filter }: { filter: object }) {
  return db.users.findOne(filter);
}

// ❌ updateOne 条件字段未校验
await db.collection.updateOne(
  { _id: req.body.id },       // id 可能是 { $gt: "" }
  { $set: req.body.update }   // update 可能注入 $where
);
```

**修复方案**：
```typescript
// ✅ 方案1：zod schema 严格校验（推荐）
const LoginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(100)
});
const { username, password } = LoginSchema.parse(req.body);

// ✅ 方案2：动态查询使用字段白名单
const ALLOWED_FIELDS = ['status', 'type', 'teamId'] as const;
function buildSafeFilter(raw: Record<string, unknown>) {
  return ALLOWED_FIELDS.reduce((acc, key) => {
    if (raw[key] !== undefined && typeof raw[key] === 'string') {
      acc[key] = raw[key] as string;
    }
    return acc;
  }, {} as Record<string, string>);
}

// ✅ _id 字段强制 ObjectId 转换
await db.collection.findOne({ _id: new Types.ObjectId(id) });
```

**检查清单**：
- [ ] 接口入参经过 zod schema 校验
- [ ] 查询条件字段均为原始类型（`string`/`number`/`boolean`）
- [ ] `req.body` 对象字段未直接传入 MongoDB 操作符位置
- [ ] `_id` 字段使用 `new Types.ObjectId(id)` 转换

---

## 2. 命令注入 / 路径遍历 🔴

```typescript
// ❌ 危险：用户输入拼入 shell 命令
exec(`convert ${req.body.filename} output.png`);
// filename = "; rm -rf /" → 执行恶意命令

// ❌ 危险：路径拼接未过滤 ../
const filePath = path.join('/uploads', req.body.path);
// path = "../../etc/passwd"

// ✅ 使用 execFile 并传数组参数
execFile('convert', [sanitizedFilename, 'output.png']);

// ✅ 校验路径在允许目录内
const resolved = path.resolve('/uploads', req.body.path);
if (!resolved.startsWith(path.resolve('/uploads'))) {
  throw new Error('Invalid path');
}
```

---

## 3. 死循环风险 🔴

**高危模式**：
```typescript
// ❌ 递归无终止条件
async function processNode(nodeId: string) {
  const node = await getNode(nodeId);
  await processNode(node.parentId);  // parentId 可能形成环形引用
}

// ❌ while 无退出条件
while (queue.length > 0) {
  const item = queue.shift();
  queue.push(...item.children);  // children 可能重新推入导致无限循环
}
```

**修复方案**：
```typescript
// ✅ 递归：深度限制 + 访问集合
async function processNode(nodeId: string, visited = new Set<string>(), depth = 0) {
  if (depth > 100 || visited.has(nodeId)) return;
  visited.add(nodeId);
  const node = await getNode(nodeId);
  await processNode(node.parentId, visited, depth + 1);
}

// ✅ 循环：最大迭代次数
const MAX_ITER = 10000;
let iter = 0;
while (queue.length > 0) {
  if (++iter > MAX_ITER) throw new Error('Max iterations exceeded');
  // ...
}
```

---

## 4. 数据膨胀 🟡

无约束的数据积累导致集合无限增长，查询变慢、内存溢出或磁盘耗尽。

```typescript
// ❌ 数组字段无上限 push
await db.collection.updateOne(
  { _id: id },
  { $push: { logs: newLog } }  // 日志数组可无限增长
);

// ❌ 批量写入无上限
await db.collection.insertMany(items);  // items 可能有几十万条

// ✅ $push + $slice 保留最近 N 条
await db.collection.updateOne(
  { _id: id },
  { $push: { logs: { $each: [newLog], $slice: -100 } } }
);

// ✅ 批量写入加上限校验
const MAX_BATCH = 1000;
if (items.length > MAX_BATCH) {
  throw new Error(`Batch size exceeds limit: ${items.length}`);
}
```

---

## 5. 敏感信息保护 🔴

```typescript
// ❌ 硬编码密钥
const API_KEY = 'sk-1234567890abcdef';

// ❌ 日志包含密码/token
addLog.info('User login', { userId, email, password });

// ✅ 使用环境变量
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error('OPENAI_API_KEY is required');

// ✅ 日志过滤敏感字段
const { password, token, ...safeUser } = user;
addLog.info('User login', safeUser);

// ✅ API 响应过滤敏感字段
const { password: _, ...safeResponse } = userData;
res.json(safeResponse);
```
