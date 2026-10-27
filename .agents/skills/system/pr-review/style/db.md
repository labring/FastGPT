# 数据库操作规范

FastGPT 使用 MongoDB (Mongoose) 和 PostgreSQL。

## 4.1 Model 定义

**文件位置**: 所属业务域的 `schema.ts`，例如 `packages/service/core/dataset/schema.ts`。

**审查要点**:
- ✅ Schema 定义使用 TypeScript 泛型
- ✅ 必要的字段添加索引
- ✅ 使用 `defineIndex(schema, { key, options, deprecated })` 声明索引；禁止 `schema.index()` 和字段级 `index: true` / `unique: true`
- ✅ 字段、唯一约束或索引变化时检查 FastGPT 明确创建过的历史索引；明确废弃的紧邻当前定义登记 `deprecated: true`，同步检查索引清理测试。不能删除客户索引或来源不明的索引
- ✅ 敏感字段加密存储
- ✅ 定义虚拟字段和实例方法

**示例**:
```typescript
import mongoose, { Schema } from '@fastgpt/service/common/mongo';
import { defineIndex } from '@fastgpt/service/common/mongo/schemaIndexes';

const UserSchema = new Schema({
  username: { type: String, required: true },
  password: { type: String, required: true, select: false },  // 默认不查询
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// 索引
defineIndex(UserSchema, { key: { username: 1 }, options: { unique: true } });
defineIndex(UserSchema, { key: { email: 1 } });

// 虚拟字段
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

export const User = mongoose.model('User', UserSchema);
```

## 4.2 查询操作

**审查要点**:
- ✅ 使用参数化查询防止注入
- ✅ 避免 N+1 查询
- ✅ 使用 projection 只查询需要的字段
- ✅ 大结果集使用分页
- ✅ 异步操作有错误处理

**示例**:
```typescript
// ❌ 不好的实践
const users = await User.find({}).lean();  // 可能返回大量数据

// ✅ 好的实践
const users = await User.find({})
  .select({ username: 1, email: 1 })  // 只查询需要的字段
  .limit(20)  // 限制结果数量
  .skip(page * 20)
  .lean();
```

## 4.3 错误处理

**审查要点**:
- ✅ 独立异步任务有错误兜底；已有上层统一处理时不要求每层重复 try-catch
- ✅ 处理重复键错误 (code 11000)
- ✅ 处理连接错误
- ✅ 错误日志包含上下文信息
