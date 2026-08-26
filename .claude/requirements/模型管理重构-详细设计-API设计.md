# 模型管理重构 — 详细设计：API 设计

> 基于主设计文档第 2.6、2.7 节展开。本文档定义所有 API 端点的完整实现规范，遵循项目既有约定：OpenAPI 路径注册、`parseApiInput` 解析、认证鉴权、错误码/i18n、审计日志、`ResponseSchema.parse`。

---

## 1. API 路由总览

所有模型 API 统一在 `/api/core/ai/model/` 下。鉴权通过 `authModel` / `authModelByTmbId` 统一处理，`isSystem` 的权限差异在 `getModelPermission` 内部处理。

```
/api/core/ai/model/
├── list.ts              # POST 分页获取当前用户可访问的模型
├── detail.ts            # GET  根据 modelId 获取模型详情
├── create.ts            # POST 创建自定义模型
├── update.ts            # PUT  更新模型配置
├── delete.ts            # DELETE 删除模型
├── test.ts              # GET  测试模型连通性
├── templates.ts         # GET  获取可用模型模板（替代 getDefaultConfig）
├── updateSystemDefault.ts # PUT  配置系统级默认模型（仅 root）
├── getSystemDefault.ts  # GET  获取系统级默认模型配置（所有用户）
├── updateWithJson.ts    # PUT  通过 JSON 批量导入/更新（仅 root）
└── getConfigJson.ts     # GET  导出所有模型配置为 JSON（仅 root）
```

协作者管理 API 在 `pro/admin/src/pages/api/system/model/collaborator/` 中直接修改现有实现，不移动路径。

**鉴权模型**：各端点通过 `authModel` 进行权限检查，`isSystem` 的特殊处理由 `getModelPermission` 内部完成，详见 [模型管理重构-详细设计-权限.md](./模型管理重构-详细设计-权限.md)。

---

## 2. 文件清单

| 文件 | 说明 |
|------|------|
| `packages/global/openapi/core/ai/model/api.ts` | 请求/响应 Zod Schema 定义 |
| `packages/global/openapi/core/ai/model/index.ts` | OpenAPIPath 路径注册 |
| `packages/global/openapi/tag.ts` | 新增 `DevApiTagsMap.model` |
| `packages/global/common/error/code/model.ts` | ModelErrEnum + 错误码定义 |
| `packages/global/support/user/audit/constants.ts` | 新增 Model 审计事件枚举 |
| `packages/service/support/user/audit/util.ts` | 新增模型审计辅助函数 |
| `projects/app/src/pages/api/core/ai/model/*.ts` | API Handler 实现 |

---

## 3. Zod Schema 定义

**文件**: `packages/global/openapi/core/ai/model/api.ts`（新建）

### 3.1 基础 Schema

```typescript
import z from 'zod';
import { ModelTypeEnum } from '../../../../core/ai/constants';
import type { PaginationResponse } from '../../../api';
import {
  ModelPriceTierSchema,
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema
} from '../../../../core/ai/model.schema';
import { PermissionSchema } from '../../../../support/permission/controller';

export const SystemModelItemSchema = z.discriminatedUnion('type', [
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema
]);

// 列表项 — 模型数据 + 来源成员 + 渠道数 + 权限
const ModelExtraFieldsSchema = z.object({
  sourceMember: z
    .object({
      name: z.string().meta({ description: '成员名称' }),
      avatar: z.string().nullable().optional().meta({ description: '成员头像' }),
      status: z.string().meta({ description: '成员状态' })
    })
    .optional()
    .meta({ description: '来源成员信息' }),
  channelCount: z.number().optional().meta({ description: '关联的渠道数量' }),
  permission: PermissionSchema.optional().meta({ description: '当前用户对该模型的权限' })
});

export const ModelListItemSchema = SystemModelItemSchema.and(ModelExtraFieldsSchema);
export type ModelListItem = z.infer<typeof ModelListItemSchema>;
```

### 3.2 各端点请求/响应 Schema

```typescript
/* ============================================================================
 * API: 分页获取模型列表
 * Route: POST /api/core/ai/model/list
 * Method: POST
 * Tags: ['Model', 'Read']
 * ============================================================================ */

export const ListModelsBodySchema = z.object({
  provider: z.string().optional().meta({ description: '按提供商过滤' }),
  type: z.string().optional().meta({ description: '按模型类型过滤' }),
  search: z.string().optional().meta({ description: '按 modelId/model/name/创建人搜索' }),
  isActive: z.enum(['active', 'inactive']).optional().meta({ description: '按激活状态过滤' }),
  isSystem: z
    .boolean()
    .optional()
    .meta({ description: '按是否系统模型过滤（双 Tab：系统模型/团队模型）' }),
  pageSize: z.coerce.number().optional().meta({ description: '每页条数，不传返回全量' }),
  pageNum: z.coerce.number().optional().meta({ description: '页码，从 1 开始' }),
  offset: z.coerce.number().optional().meta({ description: '偏移量' })
});
export type ListModelsBody = z.infer<typeof ListModelsBodySchema>;

export type ListModelsPaginationResponse = PaginationResponse<ModelListItem> & {
  activeTotal?: number;
};

/* ============================================================================
 * API: 获取模型详情
 * Route: GET /api/core/ai/model/detail
 * ============================================================================ */

export const GetModelDetailQuerySchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' })
});
export type GetModelDetailQuery = z.infer<typeof GetModelDetailQuerySchema>;

export const GetModelDetailResponseSchema = SystemModelItemSchema;
export type GetModelDetailResponse = z.infer<typeof GetModelDetailResponseSchema>;

/* ============================================================================
 * API: 创建模型
 * Route: POST /api/core/ai/model/create
 * ============================================================================ */

export const CreateModelBodySchema = z.discriminatedUnion('type', [
  LLMModelItemSchema.omit({ id: true }),
  EmbeddingModelItemSchema.omit({ id: true }),
  TTSModelItemSchema.omit({ id: true }),
  STTModelItemSchema.omit({ id: true }),
  RerankModelItemSchema.omit({ id: true })
]);
export type CreateModelBody = z.infer<typeof CreateModelBodySchema>;

export const CreateModelResponseSchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '新创建的模型 ID' })
});
export type CreateModelResponse = z.infer<typeof CreateModelResponseSchema>;

/* ============================================================================
 * API: 更新模型
 * Route: PUT /api/core/ai/model/update
 * ============================================================================ */

const _AllPartialModelFields = LLMModelItemSchema.omit({ id: true, type: true })
  .partial()
  .extend(EmbeddingModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(TTSModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(STTModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(RerankModelItemSchema.omit({ id: true, type: true }).partial().shape);

export const UpdateModelBodySchema = z
  .object({
    id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' }),
    type: z.enum(ModelTypeEnum).optional().meta({ description: '模型类型' })
  })
  .extend(_AllPartialModelFields.shape);
export type UpdateModelBody = z.infer<typeof UpdateModelBodySchema>;

export const UpdateModelResponseSchema = z.undefined().meta({ description: '操作成功' });
export type UpdateModelResponse = z.infer<typeof UpdateModelResponseSchema>;

/* ============================================================================
 * API: 删除模型
 * Route: DELETE /api/core/ai/model/delete
 * ============================================================================ */

export const DeleteModelQuerySchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' })
});
export type DeleteModelQuery = z.infer<typeof DeleteModelQuerySchema>;

export const DeleteModelResponseSchema = z
  .object({ refChannelCount: z.number() })
  .meta({ description: '操作成功（含引用渠道数，前端二次确认提示用，见 §7.5 修订说明）' });
export type DeleteModelResponse = z.infer<typeof DeleteModelResponseSchema>;

/* ============================================================================
 * API: 测试模型
 * Route: GET /api/core/ai/model/test
 * ============================================================================ */

export const TestModelQuerySchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' }),
  channelId: z.coerce.number().optional().meta({ description: '指定渠道 ID 测试' })
});
export type TestModelQuery = z.infer<typeof TestModelQuerySchema>;

/* ============================================================================
 * API: 配置系统级默认模型（仅 root）
 * Route: PUT /api/core/ai/model/updateSystemDefault
 * ============================================================================ */

export const UpdateSystemDefaultModelBodySchema = z.object({
  llmId: z.string().nullable().optional().meta({ description: '默认 LLM 模型 ID，传 null 清空' }),
  embeddingId: z.string().nullable().optional().meta({ description: '默认向量模型 ID，传 null 清空' }),
  ttsId: z.string().nullable().optional().meta({ description: '默认 TTS 模型 ID，传 null 清空' }),
  sttId: z.string().nullable().optional().meta({ description: '默认 STT 模型 ID，传 null 清空' }),
  rerankId: z.string().nullable().optional().meta({ description: '默认 ReRank 模型 ID，传 null 清空' }),
  datasetTextLLMId: z.string().nullable().optional().meta({ description: '知识库文本理解默认模型 ID' }),
  datasetImageLLMId: z.string().nullable().optional().meta({ description: '知识库图片理解默认模型 ID' }),
  chatTitleLLMId: z.string().nullable().optional().meta({ description: '标题生成默认模型 ID' }),
  helperBotLLMId: z.string().nullable().optional().meta({ description: '助手 Bot 默认模型 ID' })
});
export type UpdateSystemDefaultModelBody = z.infer<typeof UpdateSystemDefaultModelBodySchema>;

export const UpdateSystemDefaultModelResponseSchema = z.undefined().meta({ description: '操作成功' });
export type UpdateSystemDefaultModelResponse = z.infer<typeof UpdateSystemDefaultModelResponseSchema>;

/* ============================================================================
 * API: JSON 批量更新
 * Route: PUT /api/core/ai/model/updateWithJson
 * ============================================================================ */

export const SystemModelConfigJsonItemSchema = z
  .object({
    id: z.string().optional().meta({ description: '模型 ID，更新时必填；创建时留空由 upsert 自动生成' }),
    type: z.enum(ModelTypeEnum).optional().meta({ description: '模型类型' })
  })
  .extend(_AllPartialModelFields.shape);
export type SystemModelConfigJsonItem = z.infer<typeof SystemModelConfigJsonItemSchema>;

export const UpdateWithJsonBodySchema = z.object({
  config: z.string().meta({
    example: '[{"model":"gpt-4o","type":"llm","name":"GPT-4o","provider":"openai"}]',
    description: '模型配置 JSON 字符串'
  })
});
export type UpdateWithJsonBody = z.infer<typeof UpdateWithJsonBodySchema>;

export const UpdateWithJsonResponseSchema = z.undefined().meta({ description: '操作成功' });
export type UpdateWithJsonResponse = z.infer<typeof UpdateWithJsonResponseSchema>;

/* ============================================================================
 * API: 导出模型配置 JSON
 * Route: GET /api/core/ai/model/getConfigJson
 * ============================================================================ */

export const GetConfigJsonResponseSchema = z.string().meta({
  description: '模型配置 JSON 字符串'
});
export type GetConfigJsonResponse = z.infer<typeof GetConfigJsonResponseSchema>;

/* ============================================================================
 * API: 获取模型模板
 * Route: GET /api/core/ai/model/templates
 * ============================================================================ */

export const GetModelTemplatesQuerySchema = z.object({
  provider: z.string().optional().meta({ description: '按提供商过滤' }),
  type: z.string().optional().meta({ description: '按模型类型过滤' }),
  search: z.string().optional().meta({ description: '按 model/name 搜索' })
});
export type GetModelTemplatesQuery = z.infer<typeof GetModelTemplatesQuerySchema>;
```

---

## 4. OpenAPI 路径注册

**文件**: `packages/global/openapi/core/ai/model/path.ts`（`ModelPath` 定义；`index.ts` 聚合导出 `api.ts` + `path.ts`）

```typescript
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  ListModelsBodySchema,
  GetModelDetailQuerySchema,
  GetModelDetailResponseSchema,
  CreateModelBodySchema,
  CreateModelResponseSchema,
  UpdateModelBodySchema,
  UpdateModelResponseSchema,
  DeleteModelQuerySchema,
  DeleteModelResponseSchema,
  TestModelQuerySchema,
  UpdateSystemDefaultModelBodySchema,
  UpdateSystemDefaultModelResponseSchema,
  GetSystemDefaultModelResponseSchema,
  UpdateWithJsonBodySchema,
  UpdateWithJsonResponseSchema,
  GetConfigJsonResponseSchema,
  GetModelTemplatesQuerySchema
} from './api';

export const ModelPath: OpenAPIPath = {
  '/core/ai/model/list': {
    post: {
      summary: '分页获取模型列表',
      description: '获取当前用户可访问的模型列表（自己创建的 + 系统模型 + 团队授权）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: ListModelsBodySchema } }
      },
      responses: {
        200: { description: '成功返回模型列表' }
      }
    }
  },
  '/core/ai/model/detail': {
    get: {
      summary: '获取模型详情',
      description: '根据 modelId 获取模型详细信息',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetModelDetailQuerySchema },
      responses: {
        200: {
          description: '成功返回模型详情',
          content: { 'application/json': { schema: GetModelDetailResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/create': {
    post: {
      summary: '创建模型',
      description: '创建自定义模型，返回新创建的模型 ID',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: CreateModelBodySchema } }
      },
      responses: {
        200: {
          description: '成功创建模型',
          content: { 'application/json': { schema: CreateModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/update': {
    put: {
      summary: '更新模型配置',
      description: '更新模型配置元数据，支持部分更新',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateModelBodySchema } }
      },
      responses: {
        200: { description: '成功更新模型' }
      }
    }
  },
  '/core/ai/model/delete': {
    delete: {
      summary: '删除模型',
      description: '删除指定的自定义模型（系统模型需 root）',
      tags: [DevApiTagsMap.model],
      requestParams: { query: DeleteModelQuerySchema },
      responses: {
        200: { description: '成功删除模型' }
      }
    }
  },
  '/core/ai/model/test': {
    get: {
      summary: '测试模型连通性',
      description: '根据模型类型执行对应的测试请求',
      tags: [DevApiTagsMap.model],
      requestParams: { query: TestModelQuerySchema },
      responses: {
        200: { description: '测试成功' }
      }
    }
  },
  '/core/ai/model/templates': {
    get: {
      summary: '获取可用模型模板',
      description: '返回 plugin 提供的模型配置模板，供前端创建模型时填充表单',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetModelTemplatesQuerySchema },
      responses: {
        200: { description: '成功返回模板列表' }
      }
    }
  },
  '/core/ai/model/updateSystemDefault': {
    put: {
      summary: '配置系统级默认模型',
      description: 'root 配置全平台系统级默认模型（仅 root）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateSystemDefaultModelBodySchema } }
      },
      responses: {
        200: { description: '成功更新系统默认模型' }
      }
    }
  },
  '/core/ai/model/getSystemDefault': {
    get: {
      summary: '获取系统级默认模型配置',
      description: '返回各场景的系统默认模型 ID 及名称，前端创建资源时用于填充默认模型',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: '成功返回系统默认模型配置',
          content: { 'application/json': { schema: GetSystemDefaultModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/updateWithJson': {
    put: {
      summary: 'JSON 批量导入模型',
      description: '通过 JSON 配置批量导入/更新模型（仅 root）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateWithJsonBodySchema } }
      },
      responses: {
        200: { description: '成功批量更新' }
      }
    }
  },
  '/core/ai/model/getConfigJson': {
    get: {
      summary: '导出所有模型配置为 JSON',
      description: '导出所有模型配置为 JSON 字符串（仅 root）',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: '成功导出',
          content: { 'application/json': { schema: GetConfigJsonResponseSchema } }
        }
      }
    }
  }
};
```

**注册到 `openAPIPaths`** — 修改 `packages/global/openapi/path.ts`，在 `openAPIPaths` 中展开 `ModelPath`。

**新增 Tag** — 在 `packages/global/openapi/tag.ts` 的 `DevApiTagsMap` 中添加：
```typescript
model: 'AI 模型管理',
```

**注册 Tag Group** — 在 `packages/global/openapi/path.ts` 的 `openAPITagGroups` 中，于"核心-AI 相关"分组添加：
```typescript
{
  name: '核心-AI 相关',
  tags: [DevApiTagsMap.aiSkill, DevApiTagsMap.sandbox, DevApiTagsMap.aiCommon, DevApiTagsMap.model]
}
```

---

## 5. 错误码定义

### 5.1 ModelErrEnum

**文件**: `packages/global/common/error/code/model.ts`（新建）

```typescript
import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';

> 实现修订：错误码段由 508000 调整为 **513000**（`512000` 已由 coupon 模块使用），并新增
> `rootOnlyPermit`/`unAuthChannel`/`channelNotExist`/`noAvailableChannel` 四个错误码
> （模型测试、渠道管理、无可用渠道提示等验收点需要）。
>
> ⚠️ **实现修订（经评审确认，2026-08）**：新增 `modelDisabled` 错误码（513012）。
> 运行期模型调用链（`createChatCompletion`/`getVectors`/`reRankRecall`/`text2Speech`/
> `aiTranscriptions`/piAgent run）在请求层校验 `isActive === false` 直接拒绝，
> 使「停用模型仍可被存量应用调用」的问题（验收 F2-S3-TC06）闭环：停用模型即使已被
> 应用/知识库引用，调用时也会收到明确的「模型已停用」提示。错误码范围扩为 **513000–513012**。

```typescript
export enum ModelErrEnum {
  unExist = 'modelUnExist',
  unAuthModel = 'unAuthModel',
  canNotEditAdminPermission = 'canNotEditModelAdminPermission',
  invalidModelId = 'invalidModelId',
  invalidModelConfig = 'invalidModelConfig',
  modelNameConflict = 'modelNameConflict',
  systemModelReadonly = 'systemModelReadonly',
  noFieldsToUpdate = 'noFieldsToUpdate',
  rootOnlyPermit = 'rootOnlyPermit',
  unAuthChannel = 'unAuthChannel',
  channelNotExist = 'channelNotExist',
  noAvailableChannel = 'modelNoAvailableChannel'
}

const modelErrList = [
  { statusText: ModelErrEnum.unExist, message: i18nT('common:code_error.model_error.not_exist') },
  { statusText: ModelErrEnum.unAuthModel, message: i18nT('common:code_error.model_error.un_auth_model') },
  { statusText: ModelErrEnum.canNotEditAdminPermission, message: i18nT('common:code_error.model_error.can_not_edit_admin_permission') },
  { statusText: ModelErrEnum.invalidModelId, message: i18nT('common:code_error.model_error.invalid_id'), httpStatus: 400 },
  { statusText: ModelErrEnum.invalidModelConfig, message: i18nT('common:code_error.model_error.invalid_config'), httpStatus: 400 },
  { statusText: ModelErrEnum.modelNameConflict, message: i18nT('common:code_error.model_error.name_conflict'), httpStatus: 409 },
  { statusText: ModelErrEnum.systemModelReadonly, message: i18nT('common:code_error.model_error.system_model_readonly'), httpStatus: 403 },
  { statusText: ModelErrEnum.noFieldsToUpdate, message: i18nT('common:code_error.model_error.no_fields_to_update'), httpStatus: 400 },
  { statusText: ModelErrEnum.rootOnlyPermit, message: i18nT('common:code_error.model_error.root_only_permit'), httpStatus: 403 },
  { statusText: ModelErrEnum.unAuthChannel, message: i18nT('common:code_error.model_error.un_auth_channel'), httpStatus: 403 },
  { statusText: ModelErrEnum.channelNotExist, message: i18nT('common:code_error.model_error.channel_not_exist'), httpStatus: 404 },
  { statusText: ModelErrEnum.noAvailableChannel, message: i18nT('common:code_error.model_error.no_available_channel'), httpStatus: 404 },
  { statusText: ModelErrEnum.modelDisabled, message: i18nT('common:code_error.model_error.model_disabled'), httpStatus: 403 }
];

export default modelErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 513000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      ...(cur.httpStatus !== undefined ? { httpStatus: cur.httpStatus } : {})
    }
  };
}, {} as ErrType<`${ModelErrEnum}`>);
```

**错误码范围**：`513000–513012`（model 模块专用）

**注册到 `ERROR_RESPONSE`** — 在 `packages/global/common/error/errorCode.ts` 中：
```typescript
import modelErr from './code/model';
// ...在 ERROR_RESPONSE 中展开:
...modelErr,
```

### 5.2 i18n 配置

在 i18n 翻译文件中新增 `common:code_error.model_error` 命名空间：

```json
{
  "common": {
    "code_error": {
      "model_error": {
        "not_exist": "模型不存在",
        "un_auth_model": "没有权限操作该模型",
        "can_not_edit_admin_permission": "不能编辑管理员权限",
        "invalid_id": "无效的模型 ID",
        "invalid_config": "无效的模型配置",
        "name_conflict": "模型别名已存在，请更换其他别名",
        "system_model_readonly": "系统模型不可修改",
        "no_fields_to_update": "没有需要更新的字段",
        "root_only_permit": "仅管理员可操作该模型功能",
        "un_auth_channel": "没有权限操作该渠道",
        "channel_not_exist": "渠道不存在",
        "no_available_channel": "模型无可用调用的渠道"
      }
    }
  }
}
```

---

## 6. 审计日志

### 6.1 AuditEventEnum 新增枚举

在 `packages/global/support/user/audit/constants.ts` 的 `AuditEventEnum` 中新增：

```typescript
export enum AuditEventEnum {
  // ... 现有枚举 ...

  // Model
  CREATE_MODEL = 'CREATE_MODEL',
  UPDATE_MODEL = 'UPDATE_MODEL',
  DELETE_MODEL = 'DELETE_MODEL',
  UPDATE_SYSTEM_MODEL_DEFAULT = 'UPDATE_SYSTEM_MODEL_DEFAULT',
  TEST_MODEL = 'TEST_MODEL',
  UPDATE_MODEL_COLLABORATOR = 'UPDATE_MODEL_COLLABORATOR',
  DELETE_MODEL_COLLABORATOR = 'DELETE_MODEL_COLLABORATOR'
  // 注：以上两个枚举由 pro/admin/src/pages/api/system/model/collaborator/ 的 handler 使用，不在 /api/core/ai/model/ 的 handler 中
}
```

### 6.2 审计日志参数类型

```typescript
// audit log params:
// CREATE_MODEL:       { modelName: string, modelType: string }
// UPDATE_MODEL:       { modelName: string, modelType: string }
// DELETE_MODEL:       { modelName: string, modelType: string }
// UPDATE_SYSTEM_MODEL_DEFAULT: {}              — 系统默认模型变更
// TEST_MODEL:         { modelName: string, modelType: string }
// UPDATE_MODEL_COLLABORATOR: { modelName, modelType, tmbList?, groupList?, orgList?, permission }
// DELETE_MODEL_COLLABORATOR: { modelName, modelType, itemName, itemValueName }
```

### 6.3 审计辅助函数

在 `packages/service/support/user/audit/util.ts` 中新增：

> ⚠️ **实现修订（经评审确认，2026-08）**：初稿返回硬编码英文（`'LLM'`/`'Embedding'` 等），前端审计渲染器（`defaultMetadataProcessor`）仅对含 `:` 的字符串走 `t()` 翻译，导致 modelType 在所有语言下均显示英文。现对齐同级 `getI18nDatasetType`/`getI18nSkillType`：返回 `account_team:model.*` i18n key（前端自动翻译），未知类型回退 `common:UnKnow`。

```typescript
export const getI18nModelType = (type: string): string => {
  const map: Record<string, string> = {
    llm: i18nT('account_team:model.llm'),
    embedding: i18nT('account_team:model.embedding'),
    tts: i18nT('account_team:model.tts'),
    stt: i18nT('account_team:model.stt'),
    rerank: i18nT('account_team:model.rerank')
  };
  return map[type] || i18nT('common:UnKnow');
};
```

对应 i18n 词条（`packages/web/i18n/{zh-CN,en,zh-Hant}/account_team.json`，扁平 key 与 `dataset.*`/`skill.*` 一致）：

| key | zh-CN | en | zh-Hant |
|-----|-------|----|---------|
| `model.llm` | 大模型 | LLM | 大模型 |
| `model.embedding` | 向量模型 | Embedding | 向量模型 |
| `model.tts` | 语音合成 | TTS | 語音合成 |
| `model.stt` | 语音识别 | STT | 語音辨識 |
| `model.rerank` | 结果重排 | ReRank | 結果重排 |

---

## 7. API 实现规范

> 以下各端点严格遵循项目约定：
> 1. `parseApiInput` 解析请求 → 2. 鉴权 → 3. 事务 + 业务逻辑 → 4. 失败抛错误码 → 5. 异步审计日志 → 6. `ResponseSchema.parse` 返回

### 7.1 分页获取模型列表

```
POST /api/core/ai/model/list
Auth: authUserPer(per=ReadPermissionVal)
```

```typescript
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ListModelsBodySchema,
  type ListModelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<ListModelsBody>) {
  const { provider, type, search, isActive, pageSize, pageNum } =
    parseApiInput({ req, bodySchema: ListModelsBodySchema }).body;

  const { teamId, tmbId, tmb } = await authUserPer({
    req, authToken: true, per: ReadPermissionVal
  });

  // 获取用户可访问的模型（自己的 + 系统模型 + 团队授权）
  let models = await getUserAccessibleModels({
    teamId, tmbId, tmbPer: tmb.permission
  });

  // 按 provider/type/search/isActive 过滤
  if (provider) models = models.filter(m => m.provider === provider);
  if (type) models = models.filter(m => m.type === type);
  if (search) {
    const s = search.toLowerCase();
    models = models.filter(m =>
      m.id?.toLowerCase().includes(s) ||
      m.name?.toLowerCase().includes(s) ||
      m.model.toLowerCase().includes(s)
    );
  }
  // 注意：getUserAccessibleModels 对 isSystem 模型不加 isActive 过滤，因此模型选择器
  // （picker）必须始终传 isActive='active'，否则会展示已停用的系统模型。
  if (isActive === 'active') models = models.filter(m => m.isActive);
  if (isActive === 'inactive') models = models.filter(m => !m.isActive);

  // 排序：启用模型在前，同状态下按 provider 字母序
  models.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (a.provider || '').localeCompare(b.provider || '');
  });

  const activeTotal = models.filter(m => m.isActive).length;

  // 计算各模型的渠道数量（⚠️ 修订：经服务层 getChannelModelsMap 统计——按模型归属桶计算关联渠道数，
  // 见[技术设计 §2.9.2](./模型管理重构-技术设计文档.md#292-模型-渠道关联机制modelid-口径)；
  // 旧 global.aiproxyChannelsCache 已不存在，渠道实体无 modelId 字段）
  const channelCountMap = await getChannelModelsMap(tmbId);

  // 分页
  const total = models.length;
  const size = pageSize ? Number(pageSize) : total;
  const page = pageNum ? Number(pageNum) : 1;
  const start = (page - 1) * size;

  // 附加成员信息（sourceMember）、渠道数（channelCount）和权限（permission）
  const list = models.slice(start, start + size).map(m => ({
    ...m,
    channelCount: channelCountMap.get(m.id) || 0,
    // sourceMember 和 permission 由下方逻辑填充
  }));
  // ...

  return {
    list,
    total,
    pageNum: page,
    pageSize: size,
    activeTotal
  };
}

export default NextAPI(handler);
```

### 7.2 获取模型详情

```
GET /api/core/ai/model/detail?id=<modelId>
Auth: authModel(per=ReadPermissionVal)
```

```typescript
async function handler(req: ApiRequestProps<{}, GetModelDetailQuery>) {
  const { id: modelId } = parseApiInput({
    req, querySchema: GetModelDetailQuerySchema
  }).query;

  const { model } = await authModel({
    req, authToken: true, modelId, per: ReadPermissionVal
  });

  return GetModelDetailResponseSchema.parse(model);
}
```

### 7.3 创建模型

```
POST /api/core/ai/model/create
Auth: authUserPer(per=TeamModelCreatePermissionVal) — 承担系统模型和用户模型的创建（`isRoot` 可设 `isSystem: true`）
```

```typescript
async function handler(req: ApiRequestProps<CreateModelBody>): Promise<CreateModelResponse> {
  const body = parseApiInput({ req, bodySchema: CreateModelBodySchema }).body;

  const { teamId, tmbId, isRoot } = await authUserPer({
    req, authToken: true, per: TeamModelCreatePermissionVal
  });

  // 非 root 用户创建模型时忽略价格字段和 isSystem（需求：成员模型去掉价格配置，不可创建系统模型）
  if (!isRoot) {
    delete (body as any).charsPointsPrice;
    delete (body as any).priceTiers;
    delete (body as any).inputPrice;
    delete (body as any).outputPrice;
    body.isSystem = false;
  }

  // root 创建系统模型时，检查别名唯一性（需求 F2-S1 异常场景1）
  if (isRoot && body.isSystem && body.name) {
    const existing = await MongoSystemModel.findOne({
      name: body.name,
      isSystem: true
    }).lean();
    if (existing) {
      return Promise.reject(ModelErrEnum.modelNameConflict);
    }
  }

  // 通过 normalizeSystemModel() 按类型 Zod schema 清洗数据
  const modelData = normalizeSystemModel(body);

  const modelId = await mongoSessionRun(async (session) => {
    const [insertResult] = await MongoSystemModel.create(
      [{
        ...modelData,
        isSystem: body.isSystem ?? false,  // root 可直接创建系统模型；成员忽略此字段
        tmbId,
        teamId,
        isActive: body.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date()
      }],
      { session }
    );
    return String(insertResult._id);
  });

  // 缓存重载
  await updatedReloadSystemModel();

  // 私有模型写入创建者 OwnerRoleVal 权限行（协作管理 §10.3：创建者自身行恒为 Owner，全量重写时保留）
  // — 实现修订：本节原稿未提，见权限设计文档协作模型；系统模型（isSystem）不写。
  if (!modelData.isSystem) {
    await MongoResourcePermission.create({
      teamId,
      tmbId,
      resourceType: PerResourceTypeEnum.model,
      resourceId: modelId,
      permission: OwnerRoleVal
    });
  }

  // 异步审计日志
  (async () => {
    addAuditLog({
      tmbId, teamId,
      event: AuditEventEnum.CREATE_MODEL,
      params: {
        modelName: modelData.name || modelData.model,
        modelType: getI18nModelType(modelData.type)
      }
    });
  })();

  return CreateModelResponseSchema.parse({ id: modelId });
}
```

### 7.4 更新模型

```
PUT /api/core/ai/model/update
Auth: authModel(per=WritePermissionVal)
```

```typescript
async function handler(req: ApiRequestProps<UpdateModelBody>): Promise<UpdateModelResponse> {
  const { id: modelId, type, ...updates } =
    parseApiInput({ req, bodySchema: UpdateModelBodySchema }).body;

  if (Object.keys(updates).length === 0 && !type) {
    return Promise.reject(ModelErrEnum.noFieldsToUpdate);
  }

  const { teamId, tmbId, isRoot, model } = await authModel({
    req, authToken: true, modelId, per: WritePermissionVal
  });

  // 非 root 用户更新模型时忽略价格字段和 isSystem
  if (!isRoot) {
    delete (updates as any).charsPointsPrice;
    delete (updates as any).priceTiers;
    delete (updates as any).inputPrice;
    delete (updates as any).outputPrice;
    delete (updates as any).isSystem;
  }

  // normalizeSystemModel 清洗更新数据
  const cleanData = normalizeSystemModel({ ...updates, type: type ?? model.type });

  await MongoSystemModel.updateOne(
    { _id: new Types.ObjectId(modelId) },
    { $set: cleanData }
  );

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      tmbId, teamId,
      event: AuditEventEnum.UPDATE_MODEL,
      params: {
        modelName: model.name || model.model,
        modelType: getI18nModelType(model.type)
      }
    });
  })();

  return UpdateModelResponseSchema.parse(undefined);
}
```

### 7.5 删除模型

> ⚠️ **实现修订（经评审确认，2026-08）**：`DeleteModelResponseSchema` 由 `z.undefined()` 改为 `{ refChannelCount: number }`（删除前统计引用该模型的渠道数，需求 F2-S3 场景3 需要提示「该模型被 N 个渠道引用」，前端二次确认后删除）。§3.2 的 schema 声明已同步。

```
DELETE /api/core/ai/model/delete?id=<modelId>
Auth: authModel(per=ManagePermissionVal)
```

```typescript
async function handler(req: ApiRequestProps<{}, DeleteModelQuery>): Promise<DeleteModelResponse> {
  const { id: modelId } = parseApiInput({
    req, querySchema: DeleteModelQuerySchema
  }).query;

  const { teamId, tmbId, model } = await authModel({
    req, authToken: true, modelId, per: ManagePermissionVal
  });

  // ⚠️ 修订：删除前统计引用该模型的渠道数（前端二次确认数据源，需求 F2-S3 场景3）
  const refChannelCount = await channelCount(modelId);

  // 删除模型：前端做二次确认，后端直接执行
  // （需求 F2-S3 场景3 / F3-S3 场景5）

  // 删除模型 + 清理权限记录
  await mongoSessionRun(async (session) => {
    await MongoSystemModel.deleteOne({ _id: new Types.ObjectId(modelId) }, { session });
    await MongoResourcePermission.deleteMany({
      resourceType: PerResourceTypeEnum.model,
      resourceId: modelId
    }, { session });
  });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      tmbId, teamId,
      event: AuditEventEnum.DELETE_MODEL,
      params: {
        modelName: model.name || model.model,
        modelType: getI18nModelType(model.type)
      }
    });
  })();

  return DeleteModelResponseSchema.parse({ refChannelCount });
}
```

### 7.6 测试模型

```
GET /api/core/ai/model/test?id=<modelId>&channelId=<channelId>
Auth: authModel(per=ReadPermissionVal)
Desc: 测试模型连通性。重构前仅 root（authSystemAdmin）可测试，重构后改为通过模型鉴权，
      所有对该模型有读权限的用户均可测试。确保 debug、Skill 调试等场景中涉及模型测试时
      也能正确校验权限。
```

```typescript
async function handler(req: ApiRequestProps<{}, TestModelQuery>) {
  const { id: modelId, channelId } = parseApiInput({
    req, querySchema: TestModelQuerySchema
  }).query;

  const { teamId, tmbId, model } = await authModel({
    req, authToken: true, modelId, per: ReadPermissionVal
  });

  // 根据模型类型执行对应测试
  let result: unknown;
  switch (model.type) {
    case ModelTypeEnum.llm:
      result = await testLLMModel(model, channelId);
      break;
    case ModelTypeEnum.embedding:
      result = await testEmbeddingModel(model, channelId);
      break;
    // ... tts, stt, rerank
  }

  (async () => {
    addAuditLog({
      tmbId, teamId,
      event: AuditEventEnum.TEST_MODEL,
      params: {
        modelName: model.name || model.model,
        modelType: getI18nModelType(model.type)
      }
    });
  })();

  return result;
}
```

### 7.6b 获取模型模板

```
GET /api/core/ai/model/templates?provider=<provider>&type=<type>&search=<search>
Auth: authUserPer(per=ReadPermissionVal)
Desc: 替代已移除的 getDefaultConfig。从 global.modelTemplateCache 读取 plugin 提供的模型模板，
      供前端创建模型时填充表单。模板数据在启动时加载，每次请求直接返回全量列表。
```

```typescript
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<{}, GetModelTemplatesQuery>) {
  const { provider, type, search } = parseApiInput({
    req, querySchema: GetModelTemplatesQuerySchema
  }).query;

  await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  let templates = global.modelTemplateCache;

  if (provider) templates = templates.filter(t => t.provider === provider);
  if (type) templates = templates.filter(t => t.type === type);
  if (search) {
    const s = search.toLowerCase();
    templates = templates.filter(t =>
      t.name?.toLowerCase().includes(s) || t.model.toLowerCase().includes(s)
    );
  }

  return {
    templates: templates.map(t => ({
      provider: t.provider,
      type: t.type,
      model: t.model,
      name: t.name,
      avatar: t.avatar,
      defaultConfig: t.defaultConfig,
      fieldMap: t.fieldMap,
      maxContext: 'maxContext' in t ? t.maxContext : undefined,
      maxResponse: 'maxResponse' in t ? t.maxResponse : undefined,
      vision: 'vision' in t ? t.vision : undefined,
      functionCall: 'functionCall' in t ? t.functionCall : undefined,
      reasoning: 'reasoning' in t ? t.reasoning : undefined,
      toolChoice: 'toolChoice' in t ? t.toolChoice : undefined,
      voices: 'voices' in t ? t.voices : undefined
    }))
  };
}
```

### 7.7 配置系统级默认模型

```
PUT /api/core/ai/model/updateSystemDefault
Auth: authUserPer(per=ManagePermissionVal) + isRoot
Desc: root 配置全平台系统级默认模型。引用的 modelId 必须是启用的系统模型（isSystem）。
      全平台默认模型回退链路的顶层。
```

```typescript
async function handler(
  req: ApiRequestProps<UpdateSystemDefaultModelBody>
): Promise<UpdateSystemDefaultModelResponse> {
  const body = parseApiInput({
    req, bodySchema: UpdateSystemDefaultModelBodySchema
  }).body;

  const { tmbId, isRoot } = await authUserPer({
    req, authToken: true, per: ManagePermissionVal
  });

  if (!isRoot) return Promise.reject(ERROR_ENUM.unAuthorization);

  // 校验所有引用的 modelId 是启用的系统模型
  const modelIdsToCheck = [
    body.llmId, body.embeddingId, body.ttsId, body.sttId, body.rerankId,
    body.datasetTextLLMId, body.datasetImageLLMId,
    body.chatTitleLLMId, body.helperBotLLMId
  ].filter((id): id is string => typeof id === 'string' && !!id);

  if (modelIdsToCheck.length > 0) {
    const models = await MongoSystemModel.find({
      _id: { $in: modelIdsToCheck.map(id => new Types.ObjectId(id)) },
      isActive: true,
      isSystem: true
    }).lean();
    const foundIds = new Set(models.map(m => String(m._id)));
    const invalidIds = modelIdsToCheck.filter(id => !foundIds.has(id));
    if (invalidIds.length > 0) {
      return Promise.reject(
        new UserError(`以下模型不可设为系统默认（非系统模型或已停用）：${invalidIds.join(', ')}`)
      );
    }
  }

  await MongoDefaultModel.updateOne(
    {},
    {
      $set: {
        ...(body.llmId !== undefined && { llmId: body.llmId }),
        ...(body.embeddingId !== undefined && { embeddingId: body.embeddingId }),
        ...(body.ttsId !== undefined && { ttsId: body.ttsId }),
        ...(body.sttId !== undefined && { sttId: body.sttId }),
        ...(body.rerankId !== undefined && { rerankId: body.rerankId }),
        ...(body.datasetTextLLMId !== undefined && { datasetTextLLMId: body.datasetTextLLMId }),
        ...(body.datasetImageLLMId !== undefined && { datasetImageLLMId: body.datasetImageLLMId }),
        ...(body.chatTitleLLMId !== undefined && { chatTitleLLMId: body.chatTitleLLMId }),
        ...(body.helperBotLLMId !== undefined && { helperBotLLMId: body.helperBotLLMId })
      }
    },
    { upsert: true }
  );

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      tmbId,
      event: AuditEventEnum.UPDATE_SYSTEM_MODEL_DEFAULT,
      params: {}
    });
  })();

  return UpdateSystemDefaultModelResponseSchema.parse(undefined);
}
```

**校验说明**：
- 系统默认模型仅允许选择启用的系统模型（`isSystem === true && isActive === true`）
- 全平台仅一条 `default_models` 文档，使用 `upsert` 保证幂等

### 7.7b 获取系统级默认模型

```
GET /api/core/ai/model/getSystemDefault
Auth: authUserPer(per=ReadPermissionVal)
Desc: 获取系统级默认模型配置。前端创建资源（应用/知识库）时调用此接口获取各场景的默认模型 ID，
      随后通过 detail 接口获取模型详情或在模型选择器中自动选中。不需要模型鉴权（仅获取默认配置的 ID 列表）。
```

```typescript
/* ============================================================================
 * API: 获取系统级默认模型
 * Route: GET /api/core/ai/model/getSystemDefault
 * ============================================================================ */

// Schema（在 packages/global/openapi/core/ai/model/api.ts 中）
export const GetSystemDefaultModelResponseSchema = z.object({
  llm: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  embedding: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  tts: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  stt: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  rerank: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  datasetTextLLM: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  datasetImageLLM: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  chatTitleLLM: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  helperBotLLM: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable()
});
export type GetSystemDefaultModelResponse = z.infer<typeof GetSystemDefaultModelResponseSchema>;

// Handler 实现
async function handler(req: ApiRequestProps<{}, {}>): Promise<GetSystemDefaultModelResponse> {
  await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  const defaults = global.systemDefaultModel;

  const mapField = (key: keyof typeof defaults) => {
    const m = defaults[key];
    return m ? { id: m.id, model: m.model, name: m.name } : null;
  };

  return GetSystemDefaultModelResponseSchema.parse({
    llm: mapField('llm'),
    embedding: mapField('embedding'),
    tts: mapField('tts'),
    stt: mapField('stt'),
    rerank: mapField('rerank'),
    datasetTextLLM: mapField('datasetTextLLM'),
    datasetImageLLM: mapField('datasetImageLLM'),
    chatTitleLLM: mapField('chatTitleLLM'),
    helperBotLLM: mapField('helperBotLLM')
  });
}
```

**前端调用时机**：
- 新建应用/知识库时，调用 `getSystemDefault` 获取各场景默认模型 ID
- 模型选择器（如 LLM 选择器）根据 `type` 找到对应的默认模型 ID，自动选中
- 如果返回 `null`（无可用系统模型），选择器显示为空，提示用户自行选择

### 7.8 通过 JSON 批量更新

```
PUT /api/core/ai/model/updateWithJson
Auth: authUserPer + 内部 isRoot 检查
```

```typescript
async function handler(
  req: ApiRequestProps<UpdateWithJsonBody>
): Promise<UpdateWithJsonResponse> {
  const { config } = parseApiInput({
    req, bodySchema: UpdateWithJsonBodySchema
  }).body;

  const { tmbId, teamId, isRoot } = await authUserPer({
    req, authToken: true, per: ManagePermissionVal
  });
  if (!isRoot) return Promise.reject(ERROR_ENUM.unAuthorization);

  const data: SystemModelConfigJsonItem[] = JSON.parse(config);

  // Zod 校验每一行
  for (const item of data) {
    SystemModelConfigJsonItemSchema.parse(item);
    if (!item.model || !item.type || !item.provider) {
      return Promise.reject(ModelErrEnum.invalidModelConfig);
    }
  }

  await mongoSessionRun(async (session) => {
    for (const item of data) {
      const cleaned = normalizeSystemModel({ ...item });

      if (item.id) {
        // 有 id → 更新已有模型
        await MongoSystemModel.updateOne(
          { _id: new Types.ObjectId(item.id) },
          { $set: { ...cleaned, isSystem: true } },
          { upsert: true, session }
        );
      } else {
        // 无 id → 创建新模型
        await MongoSystemModel.insertOne(
          {
            ...cleaned,
            isSystem: true,
            tmbId,
            teamId,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          { session }
        );
      }
    }
  });

  await updatedReloadSystemModel();
  return UpdateWithJsonResponseSchema.parse(undefined);
}
```

### 7.9 导出所有模型配置为 JSON

```
GET /api/core/ai/model/getConfigJson
Auth: authUserPer + 内部 isRoot 检查
```

> ⚠️ **实现修订（经评审确认，2026-08）**：`MongoSystemModel.find({})` 改为 `find({ isSystem: true })` —— 只导出系统模型配置（团队私有模型包含 tmbId/teamId，JSON 回灌 updateWithJson 会写坏系统模型；私有模型重建成本低，不在导出范围）。§8 对照表第 9 行同步。

```typescript
async function handler(req: ApiRequestProps<{}, {}>): Promise<GetConfigJsonResponse> {
  const { isRoot } = await authUserPer({
    req, authToken: true, per: ReadPermissionVal
  });
  if (!isRoot) return Promise.reject(ERROR_ENUM.unAuthorization);

  // ⚠️ 修订：只导出系统模型配置（与修订说明一致；find({}) 为旧表述）
  const models = await MongoSystemModel.find({ isSystem: true }).lean();
  return GetConfigJsonResponseSchema.parse(JSON.stringify(models, null, 2));
}
```

---

## 8. 各端点规范对照

| # | 端点 | 请求解析 | 鉴权 | 事务 | 审计事件 | 响应解析 |
|---|------|---------|------|------|---------|---------|
| 1 | list | `parseApiInput` → `ListModelsBodySchema` | `authUserPer(Read)` | 无写操作 | 无 | 无 |
| 2 | detail | `parseApiInput` → `GetModelDetailQuerySchema` | `authModel(Read)` | 无 | 无 | `ResponseSchema.parse` |
| 3 | create | `parseApiInput` → `CreateModelBodySchema` | `authUserPer(TeamModelCreate)` — 承担系统模型和用户模型的创建 | `mongoSessionRun` | `CREATE_MODEL` | `CreateModelResponseSchema.parse` |
| 4 | update | `parseApiInput` → `UpdateModelBodySchema` | `authModel(Write)` — 承担系统模型和用户模型的更新（`isSystem` 需 `isRoot`） | 原子 `updateOne` | `UPDATE_MODEL` | `UpdateModelResponseSchema.parse` |
| 5 | delete | `parseApiInput` → `DeleteModelQuerySchema` | `authModel(Manage)` — 承担系统模型和用户模型的删除（`isSystem` 需 `isRoot`） | `mongoSessionRun`（删模型+权限） | `DELETE_MODEL` | `DeleteModelResponseSchema.parse` |
| 6 | test | `parseApiInput` → `TestModelQuerySchema` | `authModel(Read)` | 无 | `TEST_MODEL` | 无 |
| 6b | templates | `parseApiInput` → `GetModelTemplatesQuerySchema` | `authUserPer(Read)` | 无 | 无 | 无 |
| 7 | updateSystemDefault | `parseApiInput` → `UpdateSystemDefaultModelBodySchema` | `authUserPer(Manage)` + `isRoot` | `upsert` | `UPDATE_SYSTEM_MODEL_DEFAULT` | `UpdateSystemDefaultModelResponseSchema.parse` |
| 7b | getSystemDefault | 无 | `authUserPer(Read)` | 无 | 无 | `GetSystemDefaultModelResponseSchema.parse` |
| 8 | updateWithJson | `parseApiInput` → `UpdateWithJsonBodySchema` | `authUserPer` + `isRoot` | `mongoSessionRun` | 无 | `UpdateWithJsonResponseSchema.parse` |
| 9 | getConfigJson | 无 | `authUserPer` + `isRoot` | 无 | 无 | `GetConfigJsonResponseSchema.parse` |

---

## 9. 向后兼容层

> ⚠️ **实现修订（热升级兼容，2026-08）**：HTTP middleware `withModelIdCompat`/`MODEL_COMPAT_PATHS`（`packages/service/common/http/modelCompat.ts`）**已移除**，其「请求体 `model → modelId` 重写」职责由以下三层承担（见[热升级技术分析 §6.8](./模型管理重构-热升级技术分析.md#68-modelcompat-移除方案)）：
> 1. **入站 OpenAPI schema 补回可选 legacy 字段**（`@deprecated`）——覆盖 `packages/global/openapi/core/dataset/api.ts` 的 create/update/createWithFiles（`vectorModel/agentModel/vlmModel`，含 `datasetParams` 内嵌）、`openapi/core/app/common/api.ts` 的 `OpenAPIAppChatConfigSchema`（`chatConfig.questionGuide.model`、`chatConfig.ttsConfig.model`）、`openapi/core/ai/skill/api.ts` debugChat（`model`）；否则 zod strip 会丢弃外部调用方传入的 name；
> 2. **handler 读取 fallback**：`*ModelId ?? legacy`，name 值交给 getter 按名解析（§2.5）；
> 3. **鉴权识别 legacy 字段**：`authModels`/`extractWorkflowModelIds` 同步收集 legacy key（见主设计文档 §3.1）。
>
> `resolveModelId` 保留，作为 handler/校验层的有 teamId 上下文解析工具（下述实现不变）。

**文件**: `packages/service/core/ai/compat/resolveModelId.ts`（新建）

```typescript
export function resolveModelId(
  modelOrId: string,
  teamId: string,
  tmbId: string
): string {
  // 1. 如果传入的是有效的 ObjectId 且存在于系统，直接返回
  if (isValidObjectId(modelOrId) && global.systemModelIdMap.has(modelOrId)) {
    return modelOrId;
  }

  // 2. 否则当作 model 名字符串，查找用户可见的匹配模型
  //    过滤条件：系统模型（全平台可见）或本团队模型
  const visibleModels = global.systemActiveModelList.filter(
    m => (m.model === modelOrId || m.name === modelOrId) &&
         (m.isSystem || String(m.teamId) === teamId)
  );

  if (visibleModels.length === 0) {
    throw new Error(`Model "${modelOrId}" not found or not accessible`);
  }

  // 3. 优先级：系统模型 > 本团队模型 > 第一个匹配
  const match =
    visibleModels.find(m => m.isSystem) ??
    visibleModels.find(m => String(m.teamId) === teamId) ??
    visibleModels[0];

  return match.id;
}
```

---

## 10. 跨模块模型信息 API 与鉴权

### 10.1 概述

重构后模型以 `modelId`（ObjectId）为核心标识，所有引用模型的跨模块 API 均需要同步变更参数传递路径并对涉及模型信息使用的场景补充模型鉴权。以下枚举所有涉及模型引用或模型信息传递的 API 端点，标注重构前后的变更点和鉴权要求。

### 10.2 API 端点全景图

> ⚠️ **实现修订（热升级兼容，2026-08）**：下表「模型字段变更」列统一按**双值方案**理解（见[热升级技术分析 §6](./模型管理重构-热升级技术分析.md#6-最小代码改动设计)）：
> - `model → modelId` 类变更在热升级窗口内为「**保留 legacy 字段 + 新增 canonical 字段**」：入站请求体两者皆可（schema 保留可选 legacy `@deprecated` 字段），handler 读 `*ModelId ?? legacy`；
> - 鉴权（`authModels`）同时识别 legacy key（workflow input `model/embeddingModel/rerankModel/...`、dataset `vectorModel/agentModel/vlmModel`）；
> - 出站响应仍不暴露内部 ObjectId（向后兼容口径不变）。
> - A4/A5 行「兼容层处理 model 名→modelId」现指 handler 层 `resolveModelId`（含 teamId 上下文），非移除前的 HTTP middleware。

> ⚠️ **实现修订（经评审确认，2026-08）**：A1 与 A2 **统一为 `authModels` 严格拒绝**（不再使用
> `removeUnauthModels`）——后端宽容置空实际无触发面：模型选择器只列可见模型、模板经
> `resolveModelId`（无 teamId）只能引用系统模型、前端导入流程（ImportSettings.tsx）提交前
> 已自行清理；唯一能触发后端宽容的手工构造请求应明确报错而非静默篡改数据（对齐 AUTH-TC10，
> 验收 AUTH-TC09 已同步修订）。`removeUnauthModels` 保留于 `@fastgpt/global/core/workflow/utils`
> （扩展为全部模型字段 + chatConfig），仅供前端导入使用。

| # | 端点 | 模块 | 当前鉴权 | 重构后鉴权 | 模型字段变更 |
|---|------|------|---------|-----------|-------------|
| A1 | `POST /api/core/app/create` | 应用创建 | `authUserPer` + `removeUnauthModels` | `authUserPer` + `authModels` 批量校验（严格拒绝，对齐 AUTH-TC10） | `modules[].inputs[].model` → `modelId` |
| A2 | `PUT /api/core/app/update` | 应用编辑 | `authApp(Write)` | `authApp(Write)` + `authModels` 批量校验（严格拒绝） | `modules[].inputs[].model` → `modelId` |
| A3 | `POST /api/core/workflow/debug` | 工作流 Debug | `authCert` + `authApp(Read)` — **无模型鉴权** | 新增 `authModels` 批量校验 nodes 中的 modelId | `nodes[].inputs[].model` → `modelId` |
| A4 | `POST /api/v1/chat/completions` | Open API 对话 | `authChat` | 不变（dispatch 内部 `getLLMModel` 自动鉴权） | 兼容层处理 model 名→modelId |
| A5 | `POST /api/v2/chat/completions` | Open API v2 对话 | `authChat` | 不变（dispatch 内部 `getLLMModel` 自动鉴权） | 兼容层处理 model 名→modelId |
| D1 | `POST /api/core/dataset/create` | 知识库创建 | `authUserPer` | 不变，内部 `getLLMModel/getEmbeddingModel` 参数改为 modelId | `vectorModel/agentModel` → `*ModelId` |
| D2 | `PUT /api/core/dataset/update` | 知识库编辑 | `authDataset(Write)` | 不变 | `vectorModel/agentModel` → `*ModelId` |
| D3 | `GET /api/core/dataset/list` | 知识库列表 | `authUserPer` | 不变 | ⚠️ 热升级：响应模型字段保持向后兼容口径（出站不新增 modelId 暴露；legacy name 字段保留，见本表修订说明） |
| D4 | `GET /api/core/dataset/detail` | 知识库详情 | `authDataset(Read)` | 不变 | `vectorModel/agentModel/vlmModel` → `*ModelId` |
| D5 | `POST /api/core/dataset/createWithFiles` | 文件创建知识库 | `authUserPer` | 不变 | `getDefaultLLMModel()?.model` → `getDefaultLLMModel()?.id` |
| D6 | `POST /api/core/dataset/data/insertData` | 插入数据 | `authDataset(Write)` | 不变 | `getEmbeddingModel(vectorModel)` → `getEmbeddingModel(vectorModelId)` |
| D7 | `POST /api/core/dataset/data/pushData` | 推送数据 | `authDataset(Write)` | 不变 | `.name` 取值 → `.id` + `.name` |
| D8 | `POST /api/core/dataset/data/insertImages` | 插入图片 | `authDataset(Write)` | 不变 | `.name` 取值 → `.id` + `.name` |
| D9 | `POST /api/core/dataset/training/rebuildEmbedding` | 重建向量 | `authDataset(Write)` | 不变 | `.name` 取值 → `.id` + `.name` |
| D10 | `POST /api/core/dataset/searchTest` | 搜索测试 | `authDataset(Read)` | 不变 | `getRerankModel(rerankModel)` → `getRerankModel(rerankModelId)` |
| D11 | `POST /api/core/dataset/file/getPreviewChunks` | 分块预览 | `authDataset(Read)` | 不变 | `getLLMModel(dataset.agentModel)` → `getLLMModel(dataset.agentModelId)` |
| D12 | `POST /api/core/dataset/file/getRawTextPreviewChunks` | 原始文本分块 | `authDataset(Read)` | 不变 | 同上 |
| S1 | `POST /api/core/ai/skill/debugChat` | Skill Debug | `parseHeaderCert` — **无模型鉴权** | 新增 `authModel(per=ReadPermissionVal)` | model 参数 → modelId |
| S2 | `POST /api/core/ai/agent/createQuestionGuide` | 生成引导问题 v1 | `parseHeaderCert` | 不变，`getDefaultLLMModel()` 返回含 `.id` | `.model` → `.id` |
| S3 | `POST /api/core/ai/agent/v2/createQuestionGuide` | 生成引导问题 v2 | `parseHeaderCert` | 不变 | `.model` → `.id` |
| S4 | `POST /api/core/ai/optimizePrompt` | 提示词优化 | — | 不变 | model 参数 → modelId |
| M1 | `GET /api/core/ai/model/test` | 模型测试 | `authSystemAdmin`（仅 root） | `authModel(per=ReadPermissionVal)` | model 名 → modelId |
| M2 | `GET /api/core/ai/model/list` | 模型列表 | `authUserPer` | 不变（新增 modelId 过滤和 sourceMember） | 响应增加 `id`、`sourceMember`、`channelCount` |
| C1 | `GET /api/core/chat/record/getSpeech` | TTS 语音合成 | `parseHeaderCert` | 不变 | `ttsConfig.model` → `ttsConfig.modelId` |
| U1 | `POST /api/support/wallet/usage/createTrainingUsage` | 训练用量记录 | 内部调用 | 不变 | `.name` 取值 → 增加 `.id` |

### 10.3 鉴权变更示例

重构前以下接口**完全没有模型级鉴权**，重构后必须补充：

#### 10.3.1 工作流 Debug

**文件**: `projects/app/src/pages/api/core/workflow/debug.ts`

当前只校验了 `authCert`（用户凭证）+ `authApp`（应用权限），但请求体 `nodes` 中可能包含任意 `modelId`，用户可以传入无权访问的模型 ID 执行推理。

```typescript
// 重构后：在 dispatchWorkFlow 之前新增模型鉴权
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { nodes, appId /* ... */ } = parseApiInput({ req, bodySchema: WorkflowDebugBodySchema }).body;

  const [{ tmbId }, { app }] = await Promise.all([
    authCert({ req, authToken: true }),
    authApp({ req, authToken: true, appId, per: ReadPermissionVal })
  ]);

  // 新增：批量校验 nodes 中所有模型引用
  const modelIds = extractModelIdsFromNodes(nodes);
  if (modelIds.length > 0) {
    await authModels({ tmbId, modelIds, per: ReadPermissionVal });
  }

  // ... 原有 dispatch 逻辑
}
```

#### 10.3.2 Skill Debug Chat

**文件**: `projects/app/src/pages/api/core/ai/skill/debugChat.ts`

当前 `handleSkillDebugChat` 通过 `parseHeaderCert` 仅校验用户凭证，对模型参数无鉴权。

```typescript
// 重构后
async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 解析请求中的 modelId
  const { modelId } = req.body;

  // 新增模型鉴权
  const { model } = await authModel({
    req, authToken: true, modelId, per: ReadPermissionVal
  });

  // 鉴权通过后执行 debug 逻辑，model 已校验可用
  await handleSkillDebugChat(req, res, { model });
}
```

#### 10.3.3 模型测试接口

**文件**: `projects/app/src/pages/api/core/ai/model/test.ts`

重构前通过 `authSystemAdmin` 限制仅 root 可测试。重构后改为模型鉴权，所有对模型有读权限的用户均可测试（见 §7.6）。

### 10.4 默认模型获取策略

**系统默认模型通过独立 API 获取**：前端调用 `GET /api/core/ai/model/getSystemDefault` 获取各场景的系统默认模型 ID（定义见 §7.7b）。

前端调用时机：

1. **创建资源时填充默认模型**：
   ```typescript
   // 新建应用/知识库时
   const defaults = await fetch('/api/core/ai/model/getSystemDefault').then(r => r.json());
   // 各场景选择器根据 type 匹配对应的默认模型 ID 并自动选中
   ```

2. **模型选择器中的默认选中**：
   ```typescript
   // 加载启用模型列表 + 系统默认
   const [{ list }, defaults] = await Promise.all([
     getSystemModelList({ type: 'llm', isActive: 'active', pageSize: 20 }),
     getSystemDefault()
   ]);
   // 优先使用系统默认，fallback 到首个启用系统模型
   const defaultModelId = defaults.llm?.id ?? list.find(m => m.isSystem)?.id ?? list[0]?.id;
   ```

3. **回退策略**：`getSystemDefault` 返回的默认模型由服务端 `loadDefaultModels()` 解析（显式配置 → 首个启用的同类型系统模型 → null），前端在模型选择器中根据 `defaultValue` 自动选中。

---

## 11. Pro Admin 模型管理 API

root 作为系统超管，通过 Pro Admin 端点查看全平台所有模型、渠道及调用日志（需求 F2-S5）。这些端点遵循 `pro/admin` 现有模式：`adminCert` 鉴权、直接 MongoDB 查询（`readFromSecondary`）、跨集合 JOIN。

### 11.1 设计原则

- **鉴权**：`adminCert({ req, authToken: true })` — 仅 `username === 'root'`
- **查询**：不走 FastGPT API 层（不经过 `authModel` 团队隔离），直接查 MongoDB
- **跨集合 JOIN**：`tmbId → MongoTeamMember → MongoUser`（获取创建人名称），`teamId → MongoTeam`（获取团队名称）
- **类型定义**：Zod Schema 在 `packages/global/openapi/admin/core/model/api.ts`
- **路径注册**：`AdminModelPath` 通过 `AdminCorePath` 注册

### 11.2 Zod Schema 定义

> ⚠️ **实现修订（经评审确认，2026-08）**：本节及 §11.6 的路径注册原稿为 **GET + query**；实现统一为 **POST + requestBody**（与 sibling 管理端路由 `getApps.ts` 一致：`parseApiInput({ req, querySchema, bodySchema })`），openapi 注册于 `packages/global/openapi/admin/core/model/index.ts`。query 参数全部移入 requestBody（字段不变，见下）。

**文件**: `packages/global/openapi/admin/core/model/api.ts`（新建）

```typescript
import z from 'zod';

// ═══ POST /api/admin/routes/models/getModels（requestBody）═══
export const AdminGetModelsQuerySchema = z.object({
  pageNum: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
  offset: z.coerce.number().optional().meta({ description: '偏移量（与 pageNum 二选一）' }),
  search: z.string().optional().meta({ description: '按 modelId/model/name 搜索' }),
  provider: z.string().optional().meta({ description: '按提供商过滤' }),
  type: z.string().optional().meta({ description: '按模型类型过滤' }),
  isActive: z.enum(['active', 'inactive']).optional(),
  teamId: z.string().optional().meta({ description: '按团队过滤' }),
  tmbId: z.string().optional().meta({ description: '按创建人过滤' })
});
export type AdminGetModelsQuery = z.infer<typeof AdminGetModelsQuerySchema>;

export const AdminModelListItemSchema = z.object({
  id: z.string(),
  model: z.string(),
  name: z.string(),
  type: z.string(),
  provider: z.string(),
  avatar: z.string().optional(),
  isActive: z.boolean(),
  isSystem: z.boolean(),
  teamName: z.string().nullable().optional(),
  tmbName: z.string().nullable().optional(),
  channelCount: z.number(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

// ═══ GET /api/admin/routes/models/getChannels ═══
export const AdminGetChannelsQuerySchema = z.object({
  pageNum: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
  offset: z.coerce.number().optional(),
  search: z.string().optional(),
  teamId: z.string().optional(),
  tmbId: z.string().optional()
});

export const AdminChannelListItemSchema = ChannelListItemSchema.extend({
  creator: z
    .object({
      tmbId: z.string(),
      username: z.string(),
      teamName: z.string()
    })
    .nullable()
    .optional()
    .meta({ description: '成员渠道创建人；系统渠道为 null' })
});
// ChannelListItemSchema 基础字段（aiproxy 渠道实体）：
// id/name/type/status/models/model_mapping/base_url/priority/sets/used_amount/request_count/created_at/group_id
// + relatedModelCount（关联模型数，同归属桶内模型名匹配数）
// 系统渠道 creator 为 null；模型列表（非 admin）的创建人字段为 sourceMember（见 §3.1）

// ═══ GET /api/admin/routes/models/getUsageLogs ═══
export const AdminGetUsageLogsQuerySchema = z.object({
  pageNum: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
  offset: z.coerce.number().optional(),
  search: z.string().optional().meta({ description: '按 model 名或 modelId 搜索' }),
  teamId: z.string().optional(),
  tmbId: z.string().optional().meta({ description: '按创建人过滤' }),
  startTime: z.string().optional(),
  endTime: z.string().optional()
});

// ═══ GET /api/admin/core/dashboard/getModelStats ═══
export const AdminModelStatsResponseSchema = z.object({
  totalCount: z.number().meta({ description: '模型总数' }),
  systemCount: z.number().meta({ description: '系统模型数（isSystem: true）' }),
  teamCount: z.number().meta({ description: '团队模型数（isSystem: false）' }),
  activeCount: z.number().meta({ description: '已启用模型数' }),
  channelCount: z.number().meta({ description: '渠道总数' }),
  /** 按类型分布 */
  byType: z.object({
    llm: z.number(),
    embedding: z.number(),
    tts: z.number(),
    stt: z.number(),
    rerank: z.number()
  })
});
export type AdminModelStatsResponse = z.infer<typeof AdminModelStatsResponseSchema>;
```

### 11.3 Handler 实现参考

Handler 文件位于 `pro/admin/src/pages/api/admin/routes/models/`，遵循项目现有 Pro Admin 模式：

**文件清单**：

| 文件 | 端点 | 说明 |
|------|------|------|
| `getModels.ts` | `POST /api/admin/routes/models/getModels` | 全平台模型列表（含团队/创建人 JOIN） |
| `getChannels.ts` | `POST /api/admin/routes/models/getChannels` | 全平台渠道列表 |
| `getUsageLogs.ts` | `POST /api/admin/routes/models/getUsageLogs` | 全平台调用日志 |
| `getModelStats.ts` | `POST /api/admin/core/dashboard/getModelStats` | 模型资源统计（总数/类型分布/启用状态） |

> ⚠️ **修订**：端点为 **POST + requestBody**（§11.2 修订）；下表 handler 示例按此风格，query 参数由 body 解析。

**核心实现模式**（以 `getModels.ts` 为例，参考 `pro/admin/src/pages/api/admin/routes/apps/getApps.ts`）：

```typescript
// pro/admin/src/pages/api/admin/routes/models/getModels.ts
import { adminCert } from '@/service/support/permission/adminCert';
import { parseApiInput } from '@fastgpt/service/common/parseApiInput';
import { AdminGetModelsQuerySchema } from '@fastgpt/global/openapi/admin/core/model/api';
import { readFromSecondary } from '@fastgpt/service/common/mongo';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/teamMember/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';

async function handler(req, res) {
  // 1. adminCert — 仅 root
  await adminCert({ req, authToken: true });

  // 2. 分页参数（POST body，与 §11.2 schema 一致）
  const { pageNum, pageSize, search, provider, type, isActive, teamId, tmbId } =
    parseApiInput({ req, bodySchema: AdminGetModelsQuerySchema }).body;

  // 3. MongoDB 查询
  const query: any = {};
  if (provider) query.provider = provider;
  if (type) query.type = type;
  if (isActive === 'active') query.isActive = true;
  if (isActive === 'inactive') query.isActive = false;
  if (teamId) query.teamId = new Types.ObjectId(teamId);
  if (tmbId) query.tmbId = new Types.ObjectId(tmbId);
  if (search) {
    query.$or = [
      { model: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } }
    ];
  }

  // 4. readFromSecondary + 分页
  const [models, total] = await Promise.all([
    MongoSystemModel.find(query)
      .sort({ isActive: -1, provider: 1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .readSecondary()
      .lean(),
    MongoSystemModel.countDocuments(query).readSecondary()
  ]);

  // 5. JOIN 团队和创建人信息
  const teamIds = [...new Set(models.map(m => String(m.teamId)).filter(Boolean))];
  const tmbIds = [...new Set(models.map(m => String(m.tmbId)).filter(Boolean))];

  const [teams, tmbs] = await Promise.all([
    teamIds.length > 0
      ? MongoTeam.find({ _id: { $in: teamIds.map(id => new Types.ObjectId(id)) } })
          .readSecondary().lean()
      : [],
    tmbIds.length > 0
      ? MongoTeamMember.find({ _id: { $in: tmbIds.map(id => new Types.ObjectId(id)) } })
          .readSecondary().lean()
      : []
  ]);

  const userIds = [...new Set(tmbs.map(t => String(t.userId)).filter(Boolean))];
  const users = userIds.length > 0
    ? await MongoUser.find({ _id: { $in: userIds.map(id => new Types.ObjectId(id)) } })
        .readSecondary().lean()
    : [];

  // 6. 构建响应
  const teamMap = new Map(teams.map(t => [String(t._id), t.name]));
  const tmbUserMap = new Map(
    tmbs.map(t => {
      const user = users.find(u => String(u._id) === String(t.userId));
      return [String(t._id), user?.username ?? 'Unknown'];
    })
  );

  return {
    list: models.map(m => ({
      id: String(m._id),
      model: m.model,
      name: m.name,
      type: m.type,
      provider: m.provider,
      avatar: m.avatar,
      isActive: !!m.isActive,
      isSystem: !!m.isSystem,
      teamName: m.teamId ? (teamMap.get(String(m.teamId)) ?? null) : null,
      tmbName: m.tmbId ? (tmbUserMap.get(String(m.tmbId)) ?? null) : null,
      channelCount: 0, // 由 Channel 系统的 JOIN 查询补充
      createdAt: m.createdAt?.toISOString(),
      updatedAt: m.updatedAt?.toISOString()
    })),
    total,
    pageNum,
    pageSize
  };
}
```

### 11.4 getModelStats 实现参考

**文件**: `pro/admin/src/pages/api/admin/core/dashboard/getModelStats.ts`

遵循 `getDatasetStats.ts` 模式，提供模型资源的汇总统计数据，供 Pro 端「监控」页面使用：

```typescript
// pro/admin/src/pages/api/admin/core/dashboard/getModelStats.ts
import { adminCert } from '@/service/support/permission/adminCert';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import type { AdminModelStatsResponse } from '@fastgpt/global/openapi/admin/core/model/api';

async function handler(_req, res): Promise<AdminModelStatsResponse> {
  await adminCert({ req: _req, authToken: true });

  const [
    totalCount,
    systemCount,
    teamCount,
    activeCount,
    llmCount,
    embeddingCount,
    ttsCount,
    sttCount,
    rerankCount
  ] = await Promise.all([
    MongoSystemModel.countDocuments({}, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ isSystem: true }, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ isSystem: { $ne: true } }, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ isActive: true }, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ type: 'llm' }, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ type: 'embedding' }, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ type: 'tts' }, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ type: 'stt' }, { ...readFromSecondary }),
    MongoSystemModel.countDocuments({ type: 'rerank' }, { ...readFromSecondary })
  ]);

  // channelCount 由 Channel 系统提供，此处暂时返回 0
  // 后续 Channel 系统完成后再补充 JOIN 查询

  return {
    totalCount,
    systemCount,
    teamCount,
    activeCount,
    channelCount: 0,
    byType: { llm: llmCount, embedding: embeddingCount, tts: ttsCount, stt: sttCount, rerank: rerankCount }
  };
}
```

### 11.5 与 FastGPT 模型 API 的分工

| 维度 | FastGPT API | Pro Admin API |
|------|------------|---------------|
| **路径** | `/api/core/ai/model/*` | `/api/admin/routes/models/*` |
| **鉴权** | `authModel` / `authUserPer`（团队隔离） | `adminCert`（仅 root） |
| **模型范围** | 当前用户可访问的模型 | 全平台所有模型 |
| **团队信息** | 不暴露 | 展示团队名称、创建人 |
| **操作** | 创建/编辑/删除/测试 | 仅查看（只读） |
| **响应 Schema** | `ModelListItemSchema`（含 permission） | `AdminModelListItemSchema`（含 teamName/tmbName） |

### 11.6 路径注册

```typescript
// packages/global/openapi/admin/core/model/index.ts（新建）
import type { OpenAPIPath } from '../../../type';
import { AdminGetModelsQuerySchema, AdminGetChannelsQuerySchema, AdminGetUsageLogsQuerySchema, AdminModelStatsResponseSchema } from './api';

export const AdminModelPath: OpenAPIPath = {
  '/admin/routes/models/getModels': {
    post: {
      summary: '获取全平台模型列表（root admin）',
      tags: ['Admin - Model'],
      requestParams: { body: AdminGetModelsQuerySchema }
    }
  },
  '/admin/routes/models/getChannels': {
    post: {
      summary: '获取全平台渠道列表（root admin）',
      tags: ['Admin - Model'],
      requestParams: { body: AdminGetChannelsQuerySchema }
    }
  },
  '/admin/routes/models/getUsageLogs': {
    post: {
      summary: '获取全平台模型调用日志（root admin）',
      tags: ['Admin - Model'],
      requestParams: { body: AdminGetUsageLogsQuerySchema }
    }
  }
};
```

**`getModelStats` 路径注册**：实现将其注册在 `AdminModelPath` 内（URL `/admin/core/dashboard/getModelStats`，**GET + 无请求体**，tags: `Admin - Model`，与 `getDatasetStats` 的 dashboard 端点风格一致）。getModels/getChannels/getUsageLogs 三个列表端点为 POST + requestBody（见 §11.2 修订说明）。`AdminCorePath` 同时展开 `AdminModelPath` 与 `DashboardPath`，功能无差异，仅 tag 归属不同 —— 与 §11.2 修订说明同批调整，实现为准：

```typescript
// packages/global/openapi/admin/core/model/index.ts（新增，getModelStats 注册于 AdminModelPath 内）
'/admin/core/dashboard/getModelStats': {
  get: {
    summary: '获取模型资源统计（root admin）',
    description: '模型总数/系统模型/团队模型/启用数/渠道总数与类型分布（设计 §11.4）',
    tags: [DevApiTagsMap.adminModels],
    responses: {
      200: {
        description: '成功获取模型资源统计',
        content: { 'application/json': { schema: AdminModelStatsResponseSchema } }
      }
    }
  }
}
```

```typescript
// packages/global/openapi/admin/core/index.ts（修改）
import { AdminModelPath } from './model';

export const AdminCorePath = {
  ...DashboardPath,
  ...AdminAppPath,
  ...AdminDatasetPath,
  ...AdminModelPath  // 新增
};
```

---

## 12. 模型维度调用日志与监控 API（usageLogs / usageStats）

> 本组端点按验收点 F2-S5 场景5 / F3-S5 场景3 提供模型维度的调用日志与监控数据（前端「调用日志」「监控」Tab）。**仅返回当前用户可访问模型的 usage_items**（AUTH-TC08）。请求/响应 Schema 定义于 `packages/global/openapi/core/ai/model/api.ts`（openapi 注释中引用的「设计 §14.1/§14.2」为前端文档章节，本节为 API 侧定义）。

| 端点 | 鉴权 | 说明 |
|------|------|------|
| `POST /api/core/ai/model/usageLogs` | `authUserPer(per=ReadPermissionVal)` | 调用日志分页查询；`search` 匹配创建人用户名，可过滤可访问模型内任意 usage_item |
| `POST /api/core/ai/model/usageStats` | 同上 | 监控聚合：总数/Token/积分 + 按日趋势 + 按模型分布（积分降序） |

### 12.1 usageLogs

```typescript
export const UsageLogBodySchema = z.object({
  modelId: z.string().optional().meta({ description: '按模型过滤（必须是可访问模型）' }),
  type: z.enum(ModelTypeEnum).optional().meta({ description: '按模型类型过滤' }),
  search: z.string().optional().meta({ description: '按创建人用户名搜索' }),
  dateStart: z.string().optional().meta({ description: '开始时间（ISO 字符串）' }),
  dateEnd: z.string().optional().meta({ description: '结束时间（ISO 字符串）' }),
  pageSize: z.coerce.number().optional().meta({ description: '每页条数' }),
  pageNum: z.coerce.number().optional().meta({ description: '页码，从 1 开始' }),
  offset: z.coerce.number().optional().meta({ description: '偏移量' })
});

export type UsageLogItem = {
  id: string;
  time: string;                       // ISO time of the usage item
  modelId?: string;
  model?: string;                     // upstream model name written at record time
  name?: string;                      // display name resolved from modelId, falls back to model
  type?: `${ModelTypeEnum}`;          // resolved model type; undefined for unknown legacy records
  totalPoints: number;                // usage_items.amount
  inputTokens?: number;
  outputTokens?: number;
  sourceMember?: SourceMemberType;    // creator info { name, avatar, status }
};

export type UsageLogPaginationResponse = PaginationResponseType<UsageLogItem> & {
  pageNum?: number;
  pageSize?: number;
};
```

### 12.2 usageStats

```typescript
export const UsageStatsBodySchema = z.object({
  modelId: z.string().optional(),
  type: z.enum(ModelTypeEnum).optional(),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  unit: z.enum(['day']).optional().default('day'),
  timezone: z.string().optional().default('+00:00')   // 趋势按日分桶时区
});

export const UsageStatsResponseSchema = z.object({
  totalCalls: z.number(),     // 总调用次数（usage item 条数）
  totalTokens: z.number(),    // inputTokens + outputTokens
  totalPoints: z.number(),    // usage_items.amount 合计
  trend: z.array(z.object({   // 按日调用趋势（升序）
    date: z.string(),         // YYYY-MM-DD
    calls: z.number(),
    tokens: z.number(),
    points: z.number()
  })),
  modelDistribution: z.array(z.object({  // 按模型分布（积分降序）
    modelId: z.string(),
    name: z.string(),         // 解析失败时回退 model
    calls: z.number(),
    points: z.number()
  }))
});
```

### 12.3 实现要点

- 数据源为 `usage_items`（含历史记录经迁移补充 `modelId`，见数据迁移 Step 7）；无 `modelId` 的遗留记录按 `model` 名展示
- 模型过滤条件强制限定在可访问模型集合内（`getUserAccessibleModels`），越权 modelId 返回空结果而非报错
- 路径注册于 `packages/global/openapi/core/ai/model/path.ts`（`ModelPath`，tag: `DevApiTagsMap.model`）

---

## 13. Channel 管理 API（/api/core/ai/channel/*）

> 端点语义见 [技术设计文档 §2.9.4](./模型管理重构-技术设计文档.md#294-fastgpt-channel-api-设计)。请求/响应 Schema 定义于 `packages/global/openapi/core/ai/channel/api.ts`。**groupId 一律由服务端从会话推导**（`fastgpt:tmb:<tmbId>`），客户端只允许传 aiproxy channelId；调用侧通过 `channelType`（操作）或 `groupType`（创建）显式声明渠道归属。

| 端点 | 权限 | 说明 |
|------|------|------|
| `POST /api/core/ai/channel/create` | 成员：`TeamModelCreatePermissionVal`；root：任意 | body 含 `groupType: 'system'\|'team'`；`system` 仅 root，`team` 走会话推导的本人 group |
| `PUT /api/core/ai/channel/update` | 成员：仅本人渠道；root：任意 | body 含 `channelType`；Key 轮换即生效 |
| `DELETE /api/core/ai/channel/delete` | 同 update | query 含 `channelType`；返回 `affectedModels` 供二次确认 |
| `POST /api/core/ai/channel/status` | 同 update | body 含 `channelType` + `status`（1=启用 / 2=禁用） |
| `GET /api/core/ai/channel/test` | 同 update | query 含 `channelType`；`GET /api/channel/:id/test/{model}` 或 group 变体 |
| `GET /api/core/ai/channel/list` | 成员：登录成员可查看自有渠道（只读，不校验创建权限，见 F1 场景1/场景3）；root：任意 | 成员查自有渠道；root 带 `groupType=system` 查系统渠道，带 `groupType=team` 只查 root 自有渠道。跨成员渠道仅由 Pro Admin 端点提供；每条带 `relatedModelCount` |
| `GET /api/core/ai/channel/modelChannels` | 成员：模型可访问（模型不可见返回 `unAuthModel`，走 `getUserAccessibleModels` 过滤）；root：任意 | 单模型关联渠道明细（悬浮查看） |
| `GET /api/core/ai/channel/models` | 成员：仅本人渠道（只读，不校验创建权限，见 F1 场景1/场景3）；root：任意 | 渠道桶内全部关联模型。只读视图：resolve 按 group 路由强制自有渠道（越权/不存在 → `channelNotExist` 隐藏存在性），`system` 渠道非 root 返回 `rootOnlyPermit` |
| `GET /api/core/ai/channel/affectedModels` | 同 delete | 预查删除保护清单（二次确认数据源） |
| `GET /api/core/ai/channel/providerMetas` | 任意登录成员（认证即可，不校验创建权限） | 渠道类型元信息（默认 URL / Key 格式提示，供创建/编辑表单展示）；服务端持 admin token 代拉 `GET /api/channels/type_metas`（透传通道本身保持 root-only）。非敏感 provider 默认值；近静态数据走 TTL 10min 内存缓存 |

### 13.1 共享 Schema

```typescript
// 渠道归属显式声明（与 create 的 groupType 对称）
export const ChannelTypeEnumSchema = z.enum(['system', 'team']);

// 创建/更新载荷（镜像 aiproxy AddChannelRequest）
export const ChannelBodySchema = z.object({
  name: z.string(),
  type: z.number().int(),            // 提供商类型（1=openai、14=anthropic、36=deepseek）
  key: z.string(),                   // aiproxy 原生 API Key 凭证
  base_url: z.string().optional(),
  models: z.array(z.string()),       // 渠道服务的上游模型名（与模型 model 字段匹配）
  model_mapping: z.record(z.string(), z.string()).optional(),
  priority: z.number().int().optional(),   // 负载均衡权重，默认 10
  status: z.union([z.literal(1), z.literal(2)]).optional(),
  sets: z.array(z.string()).optional(),
  configs: z.record(z.string(), z.unknown()).optional()
});
```

### 13.2 关键端点 Schema

```typescript
// create：显式声明目标归属；groupId 永不入参
export const CreateChannelBodySchema = ChannelBodySchema.extend({
  groupType: z.enum(['system', 'team'])
});
export const CreateChannelResponseSchema = z.undefined();  // aiproxy AddChannel 无回包

// update：同 create 载荷 + id + channelType。Schema 层面 partial（与实现一致）——
// handler 内显式校验必填项：id/channelType 缺失抛 channelNotExist，name/type/key/models
// 缺失抛 invalidModelConfig（aiproxy PUT 为全量替换）
export const UpdateChannelBodySchema = ChannelBodySchema.extend({
  id: z.number().int(),
  channelType: ChannelTypeEnumSchema
}).partial();

// delete：query 携带 id + channelType；返回删除前受影响模型
export const DeleteChannelQuerySchema = z.object({
  id: z.number().int(),
  channelType: ChannelTypeEnumSchema
});
export const AffectedModelItemSchema = z.object({
  modelId: z.string(), name: z.string(), model: z.string()   // 上游 provider model 名
});
export const DeleteChannelResponseSchema = z.object({
  affectedModels: z.array(AffectedModelItemSchema)
});

// status：POST 携带 id + status
export const UpdateChannelStatusBodySchema = z.object({
  id: z.number().int(),
  status: z.union([z.literal(1), z.literal(2)]),
  channelType: ChannelTypeEnumSchema
});

// list：分页 + 创建人（团队视图）+ 关联模型数
export const ListChannelsQuerySchema = z.object({
  groupType: z.enum(['system', 'team']).optional(),   // root 视图筛选
  pageNum: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional()
});
export const ChannelListItemSchema = z.object({
  id: z.number().int(),                    // aiproxy 渠道 ID
  name: z.string(),
  type: z.number().int(),
  status: z.number().int(),                // 1=启用 / 2=禁用
  models: z.array(z.string()),             // 上游模型名列表
  model_mapping: z.record(z.string(), z.string()).optional(),
  base_url: z.string().optional(),
  priority: z.number().int().optional(),
  sets: z.array(z.string()).optional(),
  used_amount: z.number().optional(),
  request_count: z.number().optional(),
  created_at: z.number().optional(),       // Unix 毫秒
  group_id: z.string().optional(),         // 成员渠道 groupId；系统渠道无此字段
  sourceMember: SourceMemberSchema.optional(),  // 创建人（仅 root 团队渠道视图返回）
  relatedModelCount: z.number()            // 关联模型数（同归属桶内模型名匹配数）
});
```

### 13.3 错误码

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `rootOnlyPermit` | 403 | 非 root 操作系统渠道（create/update/delete/status/test 的 `groupType='system'` / `channelType='system'` 分支） |
| `unAuthChannel` | 403 | 操作非本人/无权渠道 |
| `invalidModelConfig` | 400 | update 缺少必填载荷（name/type/key/models 任一缺失，见 §13.2） |
| `channelNotExist` | 404 | aiproxy 单查不存在（`normalizeAiproxyError` 归一，aiproxy 对不存在返回 500 + "record not found"） |
| `noAvailableChannel` | 404 | 模型无可调用渠道（relay 归一） |

路径注册于 `packages/global/openapi/core/ai/channel/path.ts`（`ChannelPath`，tag: `DevApiTagsMap.model`）。

### 13.4 渠道日志与监控 API

#### 13.4.1 数据源与路由

| FastGPT 范围 | 日志列表 | 日志详情 | 监控 |
|---|---|---|---|
| `system`（仅 root） | `/api/logs/search` | `/api/logs/detail/:id` | `/api/dashboardv2/` |
| `team`（当前成员） | `/api/log/:group/group_channel/search` | `/api/log/:group/group_channel/detail/:id` | `/api/group/:group/channel-dashboardv2` |

不得使用普通 group 日志或 dashboard 接口替代上述 group-channel 接口，aiproxy 将两类数据分开存储。

#### 13.4.2 FastGPT 端点

- `GET /api/core/ai/channel/logs`：分页查询渠道调用日志。
- `GET /api/core/ai/channel/logDetail`：查询单条日志请求和响应体。
- `GET /api/core/ai/channel/dashboard`：查询按 day/hour/minute 聚合的监控时序数据。

请求 schema 只接受 `channelType: system | team`、channelId、时间范围、模型和分页/粒度参数，
不接受客户端传入 groupId 或 aiproxy path。响应统一使用 `channel`、`channel_id` 字段，并标识
截断的请求/响应体。
