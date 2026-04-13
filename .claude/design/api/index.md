# FastGPT API 设计规范

## 核心原则

### 必须遵守

1. **所有 API 必须使用 zod schema 定义入参和出参**
2. **Schema 定义在 `packages/global/openapi/` 中，类型从 schema 导出**
3. **API 路由中使用 `schema.parse()` 验证入参和出参**
4. **路由文件不导出类型别名** — 消费者直接从 openapi 包导入
5. **必须在 OpenAPI index 中注册路由**

## 文件位置约定

```
packages/global/openapi/
├── api.ts                          # 公共 Schema (分页等)
├── type.ts                         # OpenAPIPath 类型
├── tag.ts                          # API 标签定义
├── index.ts                        # 用户 API 文档入口
├── admin.ts                        # 管理员 API 文档入口
└── core/
    └── dataset/
        ├── api.ts                  # ← Schema 定义 (入参/出参)
        ├── index.ts                # ← OpenAPI 路由注册
        ├── collection/
        │   ├── api.ts
        │   └── index.ts
        └── data/
            ├── api.ts
            └── index.ts
```

## 开发流程 (5 步)

### 步骤 1: 定义 Zod Schema

**文件位置**: `packages/global/openapi/[module]/api.ts`

```typescript
import { z } from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { ParentIdSchema } from '../../../common/parentFolder/type';

/* ============================================================================
 * API: 创建知识库
 * Route: POST /api/core/dataset/create
 * ============================================================================ */
// 入参 Schema
export const CreateDatasetBodySchema = z.object({
  parentId: ParentIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '父级文件夹 ID'
  }),
  name: z.string().meta({
    example: '我的知识库',
    description: '知识库名称'
  })
});
export type CreateDatasetBodyType = z.infer<typeof CreateDatasetBodySchema>;

// 出参 Schema
export const CreateDatasetResponseSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '新创建的知识库 ID'
});
export type CreateDatasetResponseType = z.infer<typeof CreateDatasetResponseSchema>;
```

### 步骤 2: 实现 API 路由

**文件位置**: `projects/app/src/pages/api/[path]/[route].ts`

```typescript
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  CreateDatasetBodySchema,
  CreateDatasetResponseSchema,
  type CreateDatasetResponseType
} from '@fastgpt/global/openapi/core/dataset/api';

// ❌ 不要在路由文件中重导出类型别名
// export type DatasetCreateBodyType = CreateDatasetBodyType;

async function handler(req: ApiRequestProps): Promise<CreateDatasetResponseType> {
  // 1. 入参验证
  const { parentId, name } = CreateDatasetBodySchema.parse(req.body);

  // 2. 业务逻辑
  const datasetId = await createDataset({ parentId, name });

  // 3. 出参验证
  return CreateDatasetResponseSchema.parse(datasetId);
}

export default NextAPI(handler);
```

### 步骤 3: 注册 OpenAPI 路由

**3a. 添加标签** (如果是新模块): `packages/global/openapi/tag.ts`

```typescript
export const TagsMap = {
  // Dataset
  datasetCommon: '知识库管理',    // ← 新增
  datasetCollection: '集合管理',
  // ...
};
```

**3b. 注册路由**: `packages/global/openapi/[module]/index.ts`

```typescript
import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import { CreateDatasetBodySchema } from './api';

export const DatasetPath: OpenAPIPath = {
  '/core/dataset/create': {
    post: {
      summary: '创建知识库',
      description: '创建新的知识库,支持多种类型',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateDatasetBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回新创建的知识库 ID'
        }
      }
    }
  },
  ...DatasetCollectionPath,
  ...DatasetDataPath
};
```

### 步骤 4: 前端类型引用

前端直接从 openapi 包导入类型，不从 API 路由文件导入。

```typescript
// ✅ 正确: 从 openapi 导入
import type { CreateDatasetBodyType } from '@fastgpt/global/openapi/core/dataset/api';

// ❌ 错误: 从路由文件导入
import type { DatasetCreateBodyType } from '@/pages/api/core/dataset/create';

// ❌ 错误: 从旧的 global 文件导入
import type { CreateDatasetParams } from '@/global/core/dataset/api';
```

### 步骤 5: 测试文件

测试同样直接从 openapi 导入类型。

```typescript
import createHandler from '@/pages/api/core/dataset/create';
import type {
  CreateDatasetBodyType,
  CreateDatasetResponseType
} from '@fastgpt/global/openapi/core/dataset/api';
import { Call } from '@test/utils/request';

const res = await Call<CreateDatasetBodyType, {}, CreateDatasetResponseType>(createHandler, {
  auth: users.members[0],
  body: { name: 'test', intro: 'intro', avatar: 'avatar', type: DatasetTypeEnum.dataset }
});
```

## 公共 Schema 参考

使用已有的公共 Schema，避免重复定义。

### ID 类型

| Schema | 说明 | 导入路径 |
|--------|------|----------|
| `ObjectIdSchema` | MongoDB ObjectId (24位hex，自动将 ObjectId 对象转为 string) | `@fastgpt/global/common/type/mongo` |
| `ParentIdSchema` | 父级 ID (`z.string().nullish()`) | `@fastgpt/global/common/parentFolder/type` |

**ObjectId 陷阱**: MongoDB 返回的 `_id` 是 ObjectId 对象，不是 string。直接用 `z.string()` 验证出参会报错。必须使用 `ObjectIdSchema`（内置 preprocess 自动转换）。

```typescript
// ❌ 出参验证会失败 — ObjectId 不是 string
export const ResponseSchema = z.string();
return ResponseSchema.parse(document._id); // ZodError!

// ✅ ObjectIdSchema 内置 preprocess，自动转换
import { ObjectIdSchema } from '../../../common/type/mongo';
export const ResponseSchema = ObjectIdSchema;
return ResponseSchema.parse(document._id); // "68ad85a7463006c963799a05"
```

### 分页 Schema

| Schema | 说明 | 导入路径 |
|--------|------|----------|
| `PaginationSchema` | 偏移分页 (pageSize, offset, pageNum) | `@fastgpt/global/openapi/api` |
| `PaginationResponseSchema<T>` | 分页响应 (total, list) | `@fastgpt/global/openapi/api` |
| `LinkedPaginationSchema` | 游标分页 (pageSize, nextId, prevId) | `@fastgpt/global/openapi/api` |
| `LinkedListResponseSchema<T>` | 游标分页响应 (list, hasMorePrev, hasMoreNext) | `@fastgpt/global/openapi/api` |

### 认证 Schema

| Schema | 说明 | 导入路径 |
|--------|------|----------|
| `OutLinkChatAuthSchema` | 外部链接认证 (shareId, outLinkUid, teamId, teamToken) | `@fastgpt/global/support/permission/chat` |

### 业务 Schema

已有的业务级 Schema 可以直接在出入参中复用:

| Schema | 说明 | 导入路径 |
|--------|------|----------|
| `ApiDatasetServerSchema` | 第三方知识库服务器配置 | `@fastgpt/global/core/dataset/apiDataset/type` |
| `EmbeddingModelItemSchema` | 向量模型信息 | `@fastgpt/global/core/ai/model.schema` |

遇到复杂嵌套类型时，优先查找是否已有对应的 zod schema 可复用。

## Schema 字段定义规范

### meta 信息

所有字段必须有 `description`，推荐有 `example`:

```typescript
z.string().meta({
  example: 'alice@example.com',
  description: '用户邮箱'
})
```

### 可选字段

```typescript
// 可选 (undefined)
z.string().optional().meta({ description: '...' })

// 可空 (undefined | null) — 用于 parentId 等场景
z.string().nullish().meta({ description: '...' })
```

### 枚举字段

```typescript
import { DatasetTypeEnum } from '../../../core/dataset/constants';

// TypeScript enum — 使用 z.enum
z.enum(DatasetTypeEnum).meta({
  example: DatasetTypeEnum.dataset,
  description: '知识库类型'
})
```

### 嵌套对象

嵌套对象优先抽取为独立 Schema 复用:

```typescript
const FileItemSchema = z.object({
  fileId: z.string().meta({ example: 'temp/abc.pdf', description: '文件 ID' }),
  name: z.string().meta({ example: '文档.pdf', description: '文件名' })
});

export const CreateWithFilesBodySchema = z.object({
  files: z.array(FileItemSchema).meta({ description: '文件列表' })
});
```

## 旧 API 改造指南

将旧 API 迁移到 zod schema 规范时，除了上述 5 步外，还需要:

### 1. 清理旧类型定义

旧类型通常在 `projects/app/src/global/` 或路由文件中。迁移后:
- 如果旧类型已无其他引用，可删除
- 如果仍有其他 API 引用，暂保留，逐步迁移

### 2. 更新所有引用点

使用全局搜索找到所有旧类型的引用，逐一更新:

```bash
# 搜索旧类型名
grep -r "CreateDatasetParams" projects/app/src/
```

需要更新的典型位置:
- `projects/app/src/web/` — 前端 API 调用
- `projects/app/src/pageComponents/` — 页面组件
- `projects/app/test/` — 测试文件

### 3. 移除路由文件中的类型别名

```typescript
// ❌ 删除这些
export type DatasetCreateQuery = {};
export type DatasetCreateBodyType = CreateDatasetBodyType;
export type DatasetCreateResponse = CreateDatasetResponseType;
```

## 审查检查清单

### 必须检查项

**Schema 文件** (`packages/global/openapi/.../api.ts`):
- [ ] 文件头部有 API 声明注释 (路由、方法、描述、标签)
- [ ] 入参和出参都用 zod schema 定义
- [ ] 导出 `z.infer<typeof Schema>` 类型
- [ ] 所有字段有 `description`
- [ ] ID 字段使用 `ObjectIdSchema`，父级 ID 使用 `ParentIdSchema`

**API 路由文件** (`projects/app/src/pages/api/.../route.ts`):
- [ ] 入参使用 `Schema.parse(req.body)` 或 `Schema.parse(req.query)`
- [ ] 出参使用 `Schema.parse(result)`
- [ ] 函数返回值类型声明为 openapi 导出的类型
- [ ] **没有**重导出类型别名

**OpenAPI 注册** (`packages/global/openapi/.../index.ts`):
- [ ] 路由已在 index.ts 中注册
- [ ] 使用了正确的 `TagsMap` 标签
- [ ] 新模块已在 `tag.ts` 中添加标签

**类型引用**:
- [ ] 前端代码从 `@fastgpt/global/openapi/` 导入类型
- [ ] 测试文件从 `@fastgpt/global/openapi/` 导入类型
- [ ] 没有从路由文件 (`@/pages/api/...`) 导入类型

## 项目内参考示例

- **Schema 定义**: `packages/global/openapi/core/dataset/api.ts`
- **OpenAPI 注册**: `packages/global/openapi/core/dataset/index.ts`
- **API 路由实现**: `projects/app/src/pages/api/core/dataset/create.ts`
- **前端调用**: `projects/app/src/web/core/dataset/api.ts`
- **测试文件**: `projects/app/test/api/core/dataset/create.test.ts`
- **分页 Schema**: `packages/global/openapi/api.ts`
- **标签定义**: `packages/global/openapi/tag.ts`

---

**Version**: 2.0
**Last Updated**: 2026-04-10
