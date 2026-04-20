# 数据库操作规范

FastGPT 使用 MongoDB (Mongoose) 和 PostgreSQL。

## 4.1 Model 定义

**文件位置**: `packages/service/common/mongo/schema/`

**审查要点**:
- ✅ Schema 定义使用 TypeScript 泛型
- ✅ 必要的字段添加索引
- ✅ 敏感字段加密存储
- ✅ 定义虚拟字段和实例方法

**示例**:
```typescript
import { mongoose, Schema } from '@fastgpt/service/common/mongo';

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },  // 默认不查询
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// 索引
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });

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
const users = await User.find({}).toArray();  // 可能返回大量数据

// ✅ 好的实践
const users = await User.find({})
  .project({ username: 1, email: 1 })  // 只查询需要的字段
  .limit(20)  // 限制结果数量
  .skip(page * 20)
  .toArray();
```

## 4.3 错误处理

**审查要点**:
- ✅ 数据库操作使用 try-catch
- ✅ 处理重复键错误 (code 11000)
- ✅ 处理连接错误
- ✅ 错误日志包含上下文信息

---
