# 后端性能检查标准

## 1. CPU 密集型同步操作阻塞事件循环 🔴

Node.js 是单线程的，长时间的同步计算会阻塞所有并发请求。即使是几百毫秒的阻塞，在高并发下也是严重问题。

**高危模式**：
```typescript
// ❌ 同步解析/序列化超大 JSON（几十MB会卡住几百ms）
const data = JSON.parse(fs.readFileSync('/path/to/huge.json', 'utf8'));

// ❌ 大数组的同步复杂计算
const result = largeArray.reduce((acc, item) => {
  return acc + heavyComputation(item);  // 10万条数据×复杂计算
}, 0);

// ❌ 同步读取大文件
const content = fs.readFileSync('/path/to/large/file');
```

**修复方案**：
```typescript
// ✅ 拆分到多个 tick，释放事件循环
async function processLargeArray(items: Item[]) {
  const CHUNK_SIZE = 1000;
  const results: Result[] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    results.push(...chunk.map(item => process(item)));
    await new Promise(resolve => setImmediate(resolve));  // 释放事件循环
  }
  return results;
}

// ✅ CPU 密集型任务使用 worker_threads
import { Worker } from 'worker_threads';

// ✅ 文件使用流式处理
import { createReadStream } from 'fs';
const stream = createReadStream('/path/to/large/file');
```

**判断标准**：单次操作耗时预计超过 50ms 的同步计算都应考虑异步化或分片处理。

---

## 2. N+1 查询问题 🟡

在循环中对每条记录单独查询数据库，导致 N 条记录触发 N+1 次数据库请求。

```typescript
// ❌ 循环内查询：100条用户 → 101次数据库请求
const users = await db.users.find({}).toArray();
for (const user of users) {
  user.posts = await db.posts.find({ userId: user._id }).toArray();
}

// ✅ 一次查询 + 内存关联：2次数据库请求
const users = await db.users.find({}).toArray();
const userIds = users.map(u => u._id);
const allPosts = await db.posts
  .find({ userId: { $in: userIds } })
  .toArray();

const postsByUser = new Map<string, Post[]>();
allPosts.forEach(post => {
  const key = String(post.userId);
  postsByUser.set(key, [...(postsByUser.get(key) ?? []), post]);
});

users.forEach(user => {
  user.posts = postsByUser.get(String(user._id)) ?? [];
});
```

**识别信号**：循环体内出现 `await db.xxx.find/findOne/findById` 即为高度可疑。

---

## 3. 全量加载未分页 🟡

不加 `limit` 地拉取集合数据，当数据量增长到几万甚至几十万条时，单次请求会消耗大量内存和时间。

```typescript
// ❌ 无限制全量拉取
const allLogs = await db.logs.find({ userId }).toArray();
const allItems = await db.collection.find({}).toArray();

// ✅ 强制分页
const PAGE_SIZE = 50;
const logs = await db.logs
  .find({ userId })
  .sort({ createdAt: -1 })
  .skip((page - 1) * PAGE_SIZE)
  .limit(PAGE_SIZE)
  .toArray();

// ✅ 如确实需要全量（如后台任务），使用游标流式处理
const cursor = db.collection.find({}).batchSize(100);
for await (const doc of cursor) {
  await processDoc(doc);
}
```

---

## 4. 查询未投影（返回多余字段）🟢

MongoDB 默认返回文档所有字段。当文档包含大字段（如 `content`、`vectorData`、`fileContent`）时，不投影会显著增加网络传输和内存开销。

```typescript
// ❌ 返回整个文档（包含大字段）
const datasets = await db.datasets.find({ teamId }).toArray();

// ✅ 只取需要的字段
const datasets = await db.datasets
  .find({ teamId })
  .project({ name: 1, type: 1, createdAt: 1 })  // 排除 vectorData 等大字段
  .toArray();
```

---

## 5. 缺少索引的高频查询 🟡

在没有索引的字段上进行 `find`/`findOne` 会触发全表扫描，随数据量线性增长。

**检查方法**：查看查询条件中的字段，对照 Model 定义确认是否有对应索引。

```typescript
// 检查 Model 定义是否有索引
const DatasetSchema = new Schema({
  teamId: { type: String, required: true, index: true },  // ✅ 有索引
  name: { type: String },                                  // ❌ 无索引但被频繁查询？
});

// 高频查询条件
db.datasets.find({ teamId, name });  // name 无索引 → 需要添加
```
