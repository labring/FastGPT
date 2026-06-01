import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { getErrorResponse } from '../../type';

const OptionalDateSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date && Number.isNaN(value.getTime())) return undefined;
  return value;
}, z.coerce.date().optional());

export const ApiKeyLimitSchema = z
  .object({
    expiredTime: OptionalDateSchema.meta({ description: '过期时间' }),
    maxUsagePoints: z.number().optional().default(-1).meta({
      example: -1,
      description: '最大积分用量限制'
    })
  })
  .optional()
  .meta({ description: 'API Key 使用限制' });

export const OpenApiKeySchema = z.object({
  _id: ObjectIdSchema.meta({ description: 'API Key 记录 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  lastUsedTime: z.coerce.date().optional().meta({ description: '最后使用时间' }),
  apiKey: z.string().meta({ description: 'API Key，列表接口返回脱敏值' }),
  appId: ObjectIdSchema.optional().meta({ description: '绑定应用 ID' }),
  name: z.string().optional().default('Api Key').meta({ description: 'API Key 名称' }),
  usagePoints: z.number().optional().default(0).meta({ description: '累计使用积分' }),
  limit: ApiKeyLimitSchema.meta({
    description: 'API Key 使用限制，未配置时表示不限制过期时间和积分用量'
  })
});
export type OpenApiKeySchemaType = z.infer<typeof OpenApiKeySchema>;

/* ============================================================================
 * API: 创建 API Key
 * Route: POST /api/support/openapi/create
 * Method: POST
 * Description: 创建团队级或应用级 API Key。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const CreateApiKeyBodySchema = z.object({
  appId: ObjectIdSchema.optional().meta({ description: '绑定应用 ID，不传则创建团队级 API Key' }),
  name: z.string().min(1).meta({ example: '生产环境 Key', description: 'API Key 名称' }),
  limit: ApiKeyLimitSchema.meta({
    description: 'API Key 使用限制，未配置时表示不限制过期时间和积分用量'
  })
});
export type CreateApiKeyBodyType = z.infer<typeof CreateApiKeyBodySchema>;

export const CreateApiKeyResponseSchema = z.string().meta({
  description: '新创建的 API Key 明文'
});
export type CreateApiKeyResponseType = z.infer<typeof CreateApiKeyResponseSchema>;

/* ============================================================================
 * API: 获取 API Key 列表
 * Route: GET /api/support/openapi/list
 * Method: GET
 * Description: 获取团队级或指定应用下的 API Key 列表。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const GetApiKeyListQuerySchema = z.object({
  appId: ObjectIdSchema.optional().meta({ description: '应用 ID，不传则查询团队级 API Key' })
});
export type GetApiKeyListQueryType = z.infer<typeof GetApiKeyListQuerySchema>;

export const GetApiKeyListResponseSchema = z.array(OpenApiKeySchema).meta({
  description: 'API Key 列表'
});
export type GetApiKeyListResponseType = z.infer<typeof GetApiKeyListResponseSchema>;

/* ============================================================================
 * API: 更新 API Key
 * Route: PUT /api/support/openapi/update
 * Method: PUT
 * Description: 更新 API Key 名称或使用限制。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const UpdateApiKeyBodySchema = CreateApiKeyBodySchema.partial()
  .extend({
    _id: ObjectIdSchema.meta({ description: 'API Key 记录 ID' })
  })
  .refine(({ name, limit }) => name !== undefined || limit !== undefined, {
    message: 'name or limit is required'
  });
export type UpdateApiKeyBodyType = z.infer<typeof UpdateApiKeyBodySchema>;

export const UpdateApiKeyResponseSchema = z.undefined().meta({
  description: '更新成功'
});
export type UpdateApiKeyResponseType = z.infer<typeof UpdateApiKeyResponseSchema>;

/* ============================================================================
 * API: 删除 API Key
 * Route: DELETE /api/support/openapi/delete
 * Method: DELETE
 * Description: 删除指定 API Key。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const DeleteApiKeyQuerySchema = z.object({
  id: ObjectIdSchema.meta({ description: 'API Key 记录 ID' })
});
export type DeleteApiKeyQueryType = z.infer<typeof DeleteApiKeyQuerySchema>;

export const DeleteApiKeyBodySchema = z.object({}).meta({
  description: '删除 API Key 不需要请求体'
});
export type DeleteApiKeyBodyType = z.infer<typeof DeleteApiKeyBodySchema>;

export const DeleteApiKeyResponseSchema = z.undefined().meta({
  description: '删除成功'
});
export type DeleteApiKeyResponseType = z.infer<typeof DeleteApiKeyResponseSchema>;

export const ApiKeyHealthParamsSchema = z.object({
  apiKey: z.string().nonempty().meta({
    example: 'fastgpt-xxxxxxxx',
    description: '待校验的 API Key 明文'
  })
});
export type ApiKeyHealthParamsType = z.infer<typeof ApiKeyHealthParamsSchema>;

export const ApiKeyHealthResponseSchema = z.object({
  appId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: 'API Key 绑定的应用 ID；团队级 API Key 不返回'
  })
});
export type ApiKeyHealthResponseType = z.infer<typeof ApiKeyHealthResponseSchema>;

export const ApiKeyHealthErrorResponseSchema = getErrorResponse({
  message: 'APIKey invalid'
}).meta({
  description: 'API Key 无效时的统一错误响应'
});
export type ApiKeyHealthErrorResponseType = z.infer<typeof ApiKeyHealthErrorResponseSchema>;
