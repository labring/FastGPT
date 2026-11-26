---
name: api-development
description: 开发或审查 FastGPT Next.js API 路由，同步 Zod 入参和响应合约、权限校验与 OpenAPI 文档。
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

1. **API 中实际存在的业务入参和业务出参必须使用 zod schema 定义；无入参或空成功响应不创建空 Schema**
2. **已定义的 schema 必须导出对应的 TypeScript 类型**
3. **必须在 schema 文件头部声明 API 信息(路由、方法、描述、标签)，一次性管理员升级/清洗能力除外**
4. **实际存在的入参必须使用 `parseApiInput` 验证；完全无入参时不做空 Query/Body Schema 校验**
5. **实际存在业务数据的函数返回值必须使用 schema.parse() 验证；空成功响应直接返回 `undefined`，不做空 Schema 校验**
6. **必须编写完整的 OpenAPI 文档，一次性管理员升级/清洗能力除外**
7. **对外开放 OpenAPI 接口必须手动声明 `x-fastgpt-sdk` 并同步 SDK；非开放接口严禁声明**：凡挂载 `SystemOpenApiTagMap` 且非 `deprecated` 的对外开放接口，必须在 OpenAPI Path 中手动声明 `'x-fastgpt-sdk': { resource, method, streamMethod? }` 并执行 `pnpm sdk:gen`；仅站内使用（只挂 `DevApiTagsMap`）或 `deprecated: true` 的接口**禁止**声明 `x-fastgpt-sdk`，SDK 仅提供 OpenAPI 中正式声明的开放接口。

### 管理员升级与清洗能力的文档豁免

仅供系统管理员执行、用于一次性升级、迁移、修复或数据清洗的内部接口和脚本，不属于产品 API，不要求：

- 在 `packages/global/openapi/` 声明接口文档；
- 注册 OpenAPI Path；
- 编写 API 头部路由、方法、描述和标签信息。

豁免只针对文档，不豁免安全和校验要求：

- 管理员接口必须使用 `authSystemAdmin` 鉴权；
- 实际存在的 API 入参必须使用 Zod Schema 和 `parseApiInput`，完全无入参时不创建空 Schema；
- 实际存在业务数据的返回值必须使用 Zod Schema 校验，空成功响应直接返回 `undefined`；
- 数据清洗默认使用 dry-run，显式确认后才能写入，并输出成功、跳过和失败统计；
- 清洗逻辑应可重复执行，无法安全修复的数据必须跳过并报告，不得静默填入猜测值。

常规管理员产品接口（例如模型配置 CRUD、用户管理和系统配置）不因仅管理员可用而获得豁免，仍需按标准 API 流程维护文档。

## 开发流程

### 步骤 1: 定义 Zod Schema 并声明 API

**文件位置**: `packages/global/openapi/[module]/[api].ts`

**文件头部必须声明 API 信息**:

```typescript
import { z } from 'zod';
import { createPaginationSchema } from '@fastgpt/global/openapi/api';

/* ============================================================================
 * API: 获取应用对话日志列表
 * Route: POST /api/core/app/logs/list
 * Method: POST
 * Description: 获取指定应用的对话日志列表,支持分页和多种筛选条件
 * Tags: ['App', 'Log', 'Read']
 * ============================================================================ */

// 入参 Schema
export const GetAppChatLogsBodySchema = createPaginationSchema({
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

**OpenAPI Tag 归属规则**:

- 如果接口能力属于通用模块 A，但会被业务模块 B 使用，则该接口必须同时声明 A 模块 tag 和 B 模块 tag。
- 如果同一个通用接口也被业务模块 C 使用，则继续追加 C 模块 tag。
- 通用模块 tag 表示接口能力和实现抽象归属；业务模块 tag 表示该接口应出现在对应业务文档视角里。
- 如果接口只是业务模块自己的状态查询或状态操作，不属于通用模块能力，则只声明业务模块 tag，不要为了实现位置或相邻目录误加通用模块 tag。
- 示例：`协作者管理` 是通用权限能力，应用协作者接口需要同时声明 `协作者管理` 和应用侧 `权限管理`；`获取应用权限`、`恢复应用继承权限` 是应用自身权限状态接口，只声明应用侧 `权限管理`。

**Schema 定义规范**:

#### ✅ 空入参与空成功响应

- 请求没有 query、body 或 params 时，不要为了形式完整而声明 `z.object({})`，路由中也不需要调用 `parseApiInput`。
- 成功响应没有业务数据时，不要声明 `z.undefined()`、`z.null()` 或 `z.object({})` 作为占位 Schema，也不需要调用 `Schema.parse(undefined)`；handler 直接不返回值或返回 `undefined`。
- 只有请求或响应实际携带业务字段时，才定义对应 Schema、导出类型并在 API 边界执行校验。
- OpenAPI 中无入参接口省略 `requestParams`/`requestBody`；空成功响应只保留状态码和说明，不声明占位 schema。

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
import { createPaginationSchema } from '@fastgpt/global/openapi/api';

// 两种分页方式共享筛选条件
export const GetUserListSchema = createPaginationSchema({
  // 添加额外的筛选字段
  keyword: z.string().optional().meta({ description: '搜索关键词' }),
  status: z.enum(['active', 'inactive']).optional().meta({ description: '状态筛选' })
});
```

标准分页请求复用 `PaginationSchema`。有额外筛选条件时用 `createPaginationSchema({ ... })`，保留 offset 和 pageNum 两种分支。分页响应优先复用 `PaginationResponseSchema(itemSchema)`。协议确实需要兼容时在专用 wrapper 旁说明原因。

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

路由位于 `projects/app/src/pages/api/`。下面摘自[获取应用基本信息](../../../../projects/app/src/pages/api/core/app/getBasicInfo.ts)，展示有入参和业务返回值时的校验顺序。

```typescript
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getAppBasicInfoByIds } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAppBasicInfoBodySchema,
  GetAppBasicInfoResponseSchema,
  type GetAppBasicInfoBodyType,
  type GetAppBasicInfoResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

async function handler(
  req: ApiRequestProps<GetAppBasicInfoBodyType>
): Promise<GetAppBasicInfoResponseType> {
  const { body } = parseApiInput({ req, bodySchema: GetAppBasicInfoBodySchema });
  const { teamId } = await authCert({ req, authToken: true });
  const apps = await getAppBasicInfoByIds({ teamId, ids: body.ids });

  return GetAppBasicInfoResponseSchema.parse(apps);
}

export default NextAPI(handler);
```

有 query 或 params 时，向同一次 `parseApiInput` 调用传入 `querySchema` 或 `paramsSchema`，从结果的 `query` 或 `params` 取值。数据库记录、模型输出和业务响应使用各自的 Schema 校验。让异常传给 `NextAPI` 的[共享错误处理](../../../../packages/service/common/http/entry.ts)，由入口区分客户端入参错误与内部错误。

### 步骤 3: 校验资源权限

按操作选用资源对应的鉴权函数和权限值，将鉴权结果中的团队、资源 ID 用于后续查询。例如[应用日志列表](../../../../projects/app/src/pages/api/core/app/logs/list.ts)通过 `authApp` 检查 `AppReadChatLogPerVal`。

### 步骤 4: 登记 OpenAPI Path

在所属模块的 Path 中注册实际方法、路径、标签、请求与成功响应。确认该模块已接入 [openAPIPaths](../../../../packages/global/openapi/path.ts)。例如[日志模块的 Path](../../../../packages/global/openapi/core/app/log/index.ts)直接引用接口的请求与响应 Schema。

#### 对外开放接口（`SystemOpenApiTagMap`）与 SDK 元数据

- **仅站内使用（只挂 `DevApiTagsMap`）**：无需且**禁止**声明 `x-fastgpt-sdk`；SDK 暂不提供非 System OpenAPI 接口。
- **对外开放接口（挂 `SystemOpenApiTagMap` 且非 `deprecated`）**：
  - 路由 handler 必须真正支持 API Key 鉴权（`authApiKey: true` / `authAppApiKey: true` 或等效封装；现役唯一免鉴权公开例外为 `GET /core/ai/model/list` / `models.list()`，须同步登记在 `sdkContract.test.ts` 的 `SPECIAL_AUTH_OPEN_ROUTES` 与 `BaseClient` 运行时放行清单），非空成功响应必须声明 `responses[200].content`。
  - 必须手动声明 `'x-fastgpt-sdk': { resource, method, streamMethod? }`（刻意不依赖 URL 正则猜测，保证多语言 SDK 方法名稳定；`resource` 使用小写点分领域路径如 `'apps.logs'`、`'chat.histories'`、`'datasets.collections'`，`method` 使用 camelCase，双模 SSE 流式接口同步声明 `streamMethod`）。
  - 修改或新增开放接口后，必须执行 `pnpm sdk:gen`，并运行 `pnpm test packages/global/test/openapi/sdkContract.test.ts` 与 `pnpm sdk:check` 验证命名唯一、鉴权合规、生成产物无漂移。
- **已弃用接口（`deprecated: true`）**：不得挂载 `x-fastgpt-sdk`（迁移替代接口时从旧路由移除 `x-fastgpt-sdk` 并挂到新路由）。

```typescript
'/core/app/logs/search': {
  post: {
    summary: '搜索应用日志列表',
    description: '按游标搜索应用的对话日志列表，每页固定 50 条且不查询总数',
    tags: [DevApiTagsMap.appLog, SystemOpenApiTagMap.appLog],
    'x-fastgpt-sdk': {
      resource: 'apps.logs',
      method: 'search'
    },
    requestBody: {
      content: {
        'application/json': {
          schema: SearchAppChatLogsBodySchema
        }
      }
    },
    responses: {
      200: {
        description: '成功搜索应用日志列表',
        content: {
          'application/json': {
            schema: SearchAppChatLogsResponseSchema
          }
        }
      }
    }
  }
}
```

## 审查检查清单

### 🔴 必须检查项 (阻塞性)

**Schema 文件** (`packages/global/openapi/.../api.ts`):
- [ ] **文档豁免判断**: 仅一次性管理员升级/清洗能力可跳过 OpenAPI 文档
- [ ] **API 声明**: 文件头部有 API 信息(路由、方法、描述、标签)
- [ ] **Schema 定义**: 实际存在的业务入参和业务出参使用 zod 定义；没有业务值时不创建空 Schema
- [ ] **类型导出**: 为已定义的 Schema 导出 `z.infer<typeof Schema>` 类型
- [ ] **Meta 信息**: 所有字段都有 `description` 和 `example`

**API 路由文件** (`projects/app/src/pages/api/.../route.ts`):
- [ ] **入参验证**: 存在实际入参时使用 `parseApiInput`；完全无入参时不做空 Schema 校验
- [ ] **出参验证**: 返回实际业务数据时使用 `Schema.parse(responseData)`；空成功响应无需 Schema 和 parse
- [ ] **函数返回类型**: 函数返回值声明为导出的类型
- [ ] **权限验证**: API 路由有相应的权限检查 (如需要)

**OpenAPI Path 与 SDK 同步** (`packages/global/openapi/.../index.ts`):
- [ ] **对外开放接口已声明与同步**: 挂 `SystemOpenApiTagMap` 且非 `deprecated` 的接口已手动声明 `'x-fastgpt-sdk'`，并已执行 `pnpm sdk:gen` 与 `pnpm sdk:check`（通过 `sdkContract.test.ts`）
- [ ] **非开放与已弃用接口未越界**: 仅站内（只挂 `DevApiTagsMap`）与 `deprecated: true` 接口未声明 `'x-fastgpt-sdk'`

### 🟡 推荐检查项 (建议性)

- [ ] **错误处理**: 由 `NextAPI` 统一分类并处理请求校验和内部错误
- [ ] **字段验证**: 使用 zod 的验证方法 (.min(), .max(), .email() 等)
- [ ] **可空字段**: 正确使用 `.optional()` 或 `.nullish()`
- [ ] **复用 Schema**: 相同结构抽取为独立 Schema
- [ ] **分页支持**: 标准分页复用 `PaginationSchema`，业务筛选通过 `createPaginationSchema` 组合
- [ ] **Schema 复用**: 分页及其他通用结构优先复用全局 Schema，未重复声明同构的业务专用 Schema

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
  const { body: data } = parseApiInput({ req, bodySchema: YourAPIBodySchema });
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
  const { body: data } = parseApiInput({ req, bodySchema: YourAPIBodySchema });

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
  const { appId } = parseApiInput({ req, bodySchema: YourAPIBodySchema }).body;
  const result = await getData(appId);

  return result;  // 未验证出参结构
}
```

**正确做法**:
```typescript
// ✅ 正确: 验证出参
async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId } = parseApiInput({ req, bodySchema: YourAPIBodySchema }).body;
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

// 分页筛选
createPaginationSchema({
  keyword: z.string()
})

// 联合类型
z.union([z.string(), z.number()])  // 字符串或数字
z.discriminatedUnion('type', [Type1Schema, Type2Schema])
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

- [应用日志接口合约](../../../../packages/global/openapi/core/app/log/api.ts)与[分页 Schema](../../../../packages/global/openapi/api.ts)。
- [Zod Schema 与 OpenAPI 风格](../../../code/syntax.md#zod-schema-与-openapi-风格)及[请求校验错误分类](../../../design/api/zod-request-parse-error-handling.md)。
