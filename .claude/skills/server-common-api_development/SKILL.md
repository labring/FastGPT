---
name: api-development
description: FastGPT API 开发规范。重点强调使用 zod schema 定义入参和出参,在 API 文档中声明路由信息,编写对应的 OpenAPI 文档,以及在 API 路由中使用 schema.parse 进行验证。
---

# FastGPT API 开发规范

> FastGPT 项目 API 路由开发的标准化指南,确保 API 的一致性、类型安全和文档完整性。

## 何时使用此技能

- 开发新的 Next.js API 路由
- 修改现有 API 的入参或出参
- 需要 API 类型定义和文档
- 审查 API 相关代码

## 核心原则

### 🔴 必须遵守的规则

1. **所有 API 必须使用 zod schema 定义入参和出参**
2. **必须导出 schema 的 TypeScript 类型**
3. **必须在 schema 文件头部声明 API 信息(路由、方法、描述、标签)**
4. **入参必须使用 schema.parse() 验证**
5. **函数返回值必须使用 schema.parse() 验证**
6. **必须编写完整的 OpenAPI 文档**

## 开发流程

### 步骤 1: 定义 Zod Schema 并声明 API

**文件位置**: `packages/global/openapi/[module]/[api].ts`

**文件头部必须声明 API 信息**:

```typescript
import { z } from 'zod';

/* ============================================================================
 * API: 获取应用对话日志列表
 * Route: POST /api/core/app/logs/list
 * Method: POST
 * Description: 获取指定应用的对话日志列表,支持分页和多种筛选条件
 * Tags: ['App', 'Log', 'Read']
 * ============================================================================ */

// 入参 Schema
export const GetAppChatLogsBodySchema = PaginationSchema.extend({
  appId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  dateStart: z.union([z.string(), z.date()]).meta({
    example: '2024-01-01T00:00:00.000Z',
    description: '开始时间'
  }),
  dateEnd: z.union([z.string(), z.date()]).meta({
    example: '2024-12-31T23:59:59.999Z',
    description: '结束时间'
  }),
  sources: z.array(z.nativeEnum(ChatSourceEnum)).optional().meta({
    example: [ChatSourceEnum.api, ChatSourceEnum.online],
    description: '对话来源筛选'
  })
});

// 导出入参类型
export type getAppChatLogsBody = z.infer<typeof GetAppChatLogsBodySchema>;

// 出参 Schema
export const GetAppChatLogsResponseSchema = z.object({
  total: z.number().meta({ example: 100, description: '总记录数' }),
  list: z.array(ChatLogItemSchema)
});

// 导出出参类型
export type getAppChatLogsResponseType = z.infer<typeof GetAppChatLogsResponseSchema>;
```

**API 声明规范**:

```typescript
/**
 * 每个 API 文件必须在文件头部声明以下信息:
 *
 * 1. API 名称 (API): 简短的功能描述
 * 2. 路由 (Route): 完整的 API 路径
 * 3. 方法 (Method): HTTP 方法 (GET/POST/PUT/DELETE)
 * 4. 描述 (Description): API 的详细功能说明
 * 5. 标签 (Tags): API 的分类标签数组
 *
 * 标签示例:
 * - 'App': 应用相关 API
 * - 'User': 用户相关 API
 * - 'Log': 日志相关 API
 * - 'Read': 只读操作
 * - 'Write': 写入操作
 * - 'Delete': 删除操作
 */
```

**Schema 定义规范**:

#### ✅ 字段定义规范

```typescript
// ✅ 好的实践: 完整的 meta 信息
export const GetUserSchema = z.object({
  userId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '用户 ID'
  }),
  email: z.string().email().meta({
    example: 'user@example.com',
    description: '用户邮箱'
  }),
  age: z.number().int().positive().meta({
    example: 25,
    description: '用户年龄'
  }),
  status: z.enum(['active', 'inactive']).meta({
    example: 'active',
    description: '用户状态'
  })
});

// ❌ 不好的实践: 缺少 meta 信息
export const GetUserSchemaBad = z.object({
  userId: z.string(),
  email: z.string(),
  age: z.number(),
  status: z.string()
});
```

#### ✅ 嵌套对象定义

```typescript
// 嵌套对象应该定义为独立的 Schema
export const AddressSchema = z.object({
  street: z.string().meta({ description: '街道地址' }),
  city: z.string().meta({ description: '城市' }),
  country: z.string().meta({ description: '国家' })
});

export const CreateUserSchema = z.object({
  name: z.string().meta({ description: '用户名' }),
  address: AddressSchema.meta({ description: '地址信息' })
});
```

#### ✅ 数组定义

```typescript
export const GetUserListResponseSchema = z.object({
  total: z.number().meta({ example: 100, description: '总数' }),
  list: z.array(
    z.object({
      id: z.string().meta({ description: '用户 ID' }),
      name: z.string().meta({ description: '用户名' })
    })
  ).meta({ description: '用户列表' })
});
```

#### ✅ 可选字段

```typescript
export const UpdateUserSchema = z.object({
  userId: z.string().meta({ description: '用户 ID' }),
  // 可选字段使用 .optional()
  name: z.string().optional().meta({ description: '用户名' }),
  // 或使用 .nullish() 允许 null 和 undefined
  email: z.string().email().nullish().meta({ description: '用户邮箱' })
});
```

#### ✅ 分页 Schema

```typescript
import { PaginationSchema } from '@fastgpt/global/openapi/api';

// 继承分页 Schema
export const GetUserListSchema = PaginationSchema.extend({
  // 添加额外的筛选字段
  keyword: z.string().optional().meta({ description: '搜索关键词' }),
  status: z.enum(['active', 'inactive']).optional().meta({ description: '状态筛选' })
});
```

#### ✅ 多个 API 的 Schema 文件

```typescript
/* ============================================================================
 * API: 获取日志键
 * Route: GET /api/core/app/logs/keys
 * Method: GET
 * Description: 获取应用的日志配置键列表
 * Tags: ['App', 'Log', 'Read']
 * ============================================================================ */

export const GetLogKeysQuerySchema = z.object({
  appId: z.string().meta({ description: '应用 ID' })
});

export const GetLogKeysResponseSchema = z.object({
  logKeys: z.array(AppLogKeysSchema).meta({ description: '日志键列表' })
});

/* ============================================================================
 * API: 更新日志键
 * Route: POST /api/core/app/logs/keys
 * Method: POST
 * Description: 更新应用的日志配置键
 * Tags: ['App', 'Log', 'Write']
 * ============================================================================ */

export const UpdateLogKeysBodySchema = z.object({
  appId: z.string().meta({ description: '应用 ID' }),
  logKeys: z.array(AppLogKeysSchema).meta({ description: '日志键列表' })
});
```

### 步骤 2: 实现 API 路由

**文件位置**: `projects/app/src/pages/api/[path]/[route].ts`

**标准实现模板**:

```typescript
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetAppChatLogsBodySchema,
  GetAppChatLogsResponseSchema,
  type getAppChatLogsResponseType
} from '@fastgpt/global/openapi/...';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<getAppChatLogsResponseType> {
  // 🔴 步骤 1: 使用 schema.parse() 验证入参
  const { appId, dateStart, dateEnd, sources } = GetAppChatLogsBodySchema.parse(req.body);

  // 或对于 query 参数
  // const { param1, param2 } = YourAPIQuerySchema.parse(req.query);

  // 🔴 步骤 2: 业务逻辑处理
  const result = await yourBusinessLogic({ appId, dateStart, dateEnd, sources });

  // 🔴 步骤 3: 使用 schema.parse() 验证出参
  return GetAppChatLogsResponseSchema.parse({
    list: result.list,
    total: result.total
  });
}

export default NextAPI(handler);
```

**完整示例**:

```typescript
import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import {
  GetAppChatLogsBodySchema,
  GetAppChatLogsResponseSchema,
  type getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<getAppChatLogsResponseType> {
  // 🔴 1. 验证入参
  const { appId, dateStart, dateEnd, sources } = GetAppChatLogsBodySchema.parse(req.body);

  // 2. 权限验证 (如果需要)
  await authApp({
    req,
    authToken: true,
    appId,
    per: AppReadChatLogPerVal
  });

  // 3. 业务逻辑
  const { list, total } = await getChatLogsFromDB({
    appId,
    dateStart,
    dateEnd,
    sources
  });

  // 🔴 4. 验证出参
  return GetAppChatLogsResponseSchema.parse({
    list,
    total
  });
}

export default NextAPI(handler);
```

### 步骤 3: 权限验证 (如需要)

**使用 `authApp` 或其他权限验证函数**:

```typescript
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppWritePerVal } from '@fastgpt/global/support/permission/app/constant';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId } = YourAPIBodySchema.parse(req.body);

  // 权限验证
  await authApp({
    req,
    authToken: true,
    appId,
    per: AppWritePerVal  // 权限常量
  });

  // 继续处理...
}
```

### 步骤 4: 错误处理

**使用统一的错误处理**:

```typescript
import { APIError } from '@fastgpt/service/core/error/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  try {
    const { appId } = YourAPIBodySchema.parse(req.body);

    if (!appId) {
      return Promise.reject(CommonErrEnum.missingParams);
    }

    // 业务逻辑...

  } catch (error) {
    // 统一错误处理
    return APIError(error)(req, res);
  }
}
```

## 完整开发示例

### 场景: 创建用户 API

**1. 定义 Schema** (`packages/global/openapi/core/user/api.ts`):

```typescript
import { z } from 'zod';

/* ============================================================================
 * API: 创建用户
 * Route: POST /api/core/user/create
 * Method: POST
 * Description: 创建新用户,返回创建的用户信息
 * Tags: ['User', 'Write']
 * ============================================================================ */

// 入参
export const CreateUserBodySchema = z.object({
  name: z.string().min(2).max(50).meta({
    example: 'Alice',
    description: '用户名 (2-50 字符)'
  }),
  email: z.string().email().meta({
    example: 'alice@example.com',
    description: '用户邮箱'
  }),
  age: z.number().int().positive().optional().meta({
    example: 25,
    description: '用户年龄'
  }),
  avatar: z.string().url().optional().meta({
    example: 'https://example.com/avatar.jpg',
    description: '头像 URL'
  })
});

export type createUserBodyType = z.infer<typeof CreateUserBodySchema>;

// 出参
export const CreateUserResponseSchema = z.object({
  userId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '用户 ID' }),
  name: z.string().meta({ example: 'Alice', description: '用户名' }),
  email: z.string().meta({ example: 'alice@example.com', description: '用户邮箱' }),
  createdAt: z.date().meta({ example: '2024-01-01T00:00:00.000Z', description: '创建时间' })
});

export type createUserResponseType = z.infer<typeof CreateUserResponseSchema>;
```

**2. 实现 API** (`projects/app/src/pages/api/core/user/create.ts`):

```typescript
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoUser } from '@fastgpt/service/core/user/schema';
import {
  CreateUserBodySchema,
  CreateUserResponseSchema,
  type createUserResponseType
} from '@fastgpt/global/openapi/core/user/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<createUserResponseType> {
  // 🔴 验证入参
  const { name, email, age, avatar } = CreateUserBodySchema.parse(req.body);

  // 检查邮箱是否已存在
  const existingUser = await MongoUser.findOne({ email });
  if (existingUser) {
    return Promise.reject('Email already exists');
  }

  // 创建用户
  const user = await MongoUser.create({
    name,
    email,
    age,
    avatar,
    createdAt: new Date()
  });

  // 🔴 验证出参
  return CreateUserResponseSchema.parse({
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  });
}

export default NextAPI(handler);
```

## 审查检查清单

### 🔴 必须检查项 (阻塞性)

**Schema 文件** (`packages/global/openapi/.../api.ts`):
- [ ] **API 声明**: 文件头部有 API 信息(路由、方法、描述、标签)
- [ ] **Schema 定义**: 入参和出参都使用 zod 定义
- [ ] **类型导出**: 导出 `z.infer<typeof Schema>` 类型
- [ ] **Meta 信息**: 所有字段都有 `description` 和 `example`

**API 路由文件** (`projects/app/src/pages/api/.../route.ts`):
- [ ] **入参验证**: 使用 `Schema.parse(req.body)` 或 `parse(req.query)`
- [ ] **出参验证**: 使用 `Schema.parse(responseData)`
- [ ] **函数返回类型**: 函数返回值声明为导出的类型
- [ ] **权限验证**: API 路由有相应的权限检查 (如需要)

### 🟡 推荐检查项 (建议性)

- [ ] **错误处理**: 使用 `APIError` 统一错误处理
- [ ] **字段验证**: 使用 zod 的验证方法 (.min(), .max(), .email() 等)
- [ ] **可空字段**: 正确使用 `.optional()` 或 `.nullish()`
- [ ] **复用 Schema**: 相同结构抽取为独立 Schema
- [ ] **分页支持**: 列表 API 继承 `PaginationSchema`

### 🟢 可选检查项 (优化性)

- [ ] **字段顺序**: 字段按重要性排序
- [ ] **Schema 复用**: 复用现有 Schema 减少重复
- [ ] **注释**: 复杂逻辑添加注释

## 常见问题和解决方案

### 问题 1: 缺少 API 声明

**错误示例**:
```typescript
// ❌ 错误: 缺少 API 声明
import { z } from 'zod';

export const GetUserSchema = z.object({
  id: z.string()
});
```

**正确做法**:
```typescript
// ✅ 正确: 包含完整的 API 声明
import { z } from 'zod';

/* ============================================================================
 * API: 获取用户信息
 * Route: GET /api/core/user/detail
 * Method: GET
 * Description: 根据 userId 获取用户详细信息
 * Tags: ['User', 'Read']
 * ============================================================================ */

export const GetUserSchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '用户 ID'
  })
});
```

### 问题 2: 类型不匹配

**错误示例**:
```typescript
// ❌ 错误: 函数返回类型未声明
async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const data = YourAPIBodySchema.parse(req.body);
  return { success: true, data };  // 类型未声明
}
```

**正确做法**:
```typescript
// ✅ 正确: 声明返回类型
async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<yourAPIResponseType> {
  const data = YourAPIBodySchema.parse(req.body);

  return YourAPIResponseSchema.parse({
    success: true,
    data
  });
}
```

### 问题 3: 缺少 Meta 信息

**错误示例**:
```typescript
// ❌ 错误: 缺少 meta 信息
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string()
});
```

**正确做法**:
```typescript
// ✅ 正确: 完整的 meta 信息
export const UserSchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '用户 ID'
  }),
  name: z.string().meta({
    example: 'Alice',
    description: '用户名'
  }),
  email: z.string().email().meta({
    example: 'alice@example.com',
    description: '用户邮箱'
  })
});
```

### 问题 4: 未验证出参

**错误示例**:
```typescript
// ❌ 错误: 直接返回数据
async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId } = YourAPIBodySchema.parse(req.body);
  const result = await getData(appId);

  return result;  // 未验证出参结构
}
```

**正确做法**:
```typescript
// ✅ 正确: 验证出参
async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId } = YourAPIBodySchema.parse(req.body);
  const result = await getData(appId);

  return YourAPIResponseSchema.parse(result);
}
```

### 问题 5: Schema 复用不当

**不好做法**:
```typescript
// ❌ 重复定义相同的结构
export const Schema1 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string()
});

export const Schema2 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string()
});
```

**正确做法**:
```typescript
// ✅ 抽取公共 Schema
export const BaseUserSchema = z.object({
  id: z.string().meta({ description: 'ID' }),
  name: z.string().meta({ description: '名称' }),
  email: z.string().email().meta({ description: '邮箱' })
});

export const Schema1 = z.object({
  user: BaseUserSchema
});

export const Schema2 = z.object({
  users: z.array(BaseUserSchema)
});
```

## 快速参考

### API 声明模板

```typescript
/* ============================================================================
 * API: [简短功能描述]
 * Route: [HTTP 方法] [完整路由路径]
 * Method: [GET/POST/PUT/DELETE]
 * Description: [详细功能说明]
 * Tags: [['模块', '子模块', '操作类型']]
 * ============================================================================ */
```

### 常用标签

- **模块标签**: `App`, `User`, `Chat`, `Workflow`, `Dataset`
- **操作类型**: `Read`, `Write`, `Delete`, `Update`
- **其他**: `Admin`, `Public`, `Internal`

### 常用 Zod 验证方法

```typescript
// 字符串
z.string()                    // 字符串
  .min(2)                     // 最小长度
  .max(50)                    // 最大长度
  .email()                    // 邮箱格式
  .url()                      // URL 格式
  .uuid()                     // UUID 格式

// 数字
z.number()                    // 数字
  .int()                      // 整数
  .positive()                 // 正数
  .min(0)                     // 最小值
  .max(100)                   // 最大值

// 布尔
z.boolean()                   // 布尔值

// 日期
z.date()                      // 日期对象
  .or(z.string())             // 或日期字符串

// 枚举
z.enum(['active', 'inactive'])  // 枚举值
z.nativeEnum(MyEnum)           // TypeScript 枚举

// 数组
z.array(z.string())           // 字符串数组
  .min(1)                     // 最小长度
  .max(10)                    // 最大长度

// 可选
z.string().optional()         // 可选 (undefined)
z.string().nullish()          // 可空 (undefined | null)

// 对象
z.object({                    // 对象
  name: z.string(),
  age: z.number()
})

// 继承
PaginationSchema.extend({     // 扩展
  keyword: z.string()
})

// 联合类型
z.union([z.string(), z.number()])  // 字符串或数字
z.discriminator('type', {          // 判别联合
  type1: Type1Schema,
  type2: Type2Schema
})
```

### Meta 字段说明

```typescript
z.string().meta({
  example: 'value',              // 示例值 (必填)
  description: '字段说明'         // 字段描述 (必填)
})
```

### TypeScript 类型导出

```typescript
// Schema 定义
export const UserSchema = z.object({
  id: z.string(),
  name: z.string()
});

// 导出类型 (命名规范: camelCase)
export type userType = z.infer<typeof UserSchema>;

// 或使用 PascalCase
export type UserType = z.infer<typeof UserSchema>;
```

## 参考资源

### 项目内示例

- **API Schema 示例**: `/Volumes/code/fastgpt-pro/FastGPT/packages/global/openapi/core/app/log/api.ts`
- **API 实现示例**: `/Volumes/code/fastgpt-pro/FastGPT/projects/app/src/pages/api/core/app/logs/list.ts`
- **分页 Schema**: `packages/global/openapi/api.ts`

### 相关文档

- **Zod 官方文档**: https://zod.dev/
- **FastGPT API 规范**: `.claude/skills/pr-review/fastgpt-style-guide.md`
- **PR Review 审查维度**: `.claude/skills/pr-review/code-quality-standards.md`

---

**Version**: 1.0
**Last Updated**: 2026-01-27
**Maintainer**: FastGPT Development Team
