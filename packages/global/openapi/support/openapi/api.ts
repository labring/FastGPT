import { requiredAlternatives } from '../../../common/zod/openapi';
import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { getErrorResponse } from '../../type';
import { OpenApiTagSchema, OpenApiTagsInputSchema } from './tag';
import { BoolSchema, queryArrayParam } from '../../../common/zod';
import { ApiKeyTypeSchema } from '../../../support/openapi/schema';
import { ApiKeyTypeEnum } from '../../../support/openapi/constants';
import { SourceMemberSchema } from '../../../support/user/type';

const OptionalDateSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date && Number.isNaN(value.getTime())) return undefined;
  return value;
}, z.coerce.date().optional());

export const ApiKeyLimitSchema = z
  .object({
    expiredTime: OptionalDateSchema.meta({ description: '过期时间' }),
    maxUsagePoints: z.number().default(-1).meta({
      example: -1,
      description: '最大积分用量限制'
    })
  })
  .optional()
  .meta({ description: 'API Key 使用限制' });

export const ApiKeyListSortBySchema = z.enum(['createTime', 'lastUsedTime', 'remainingPoints']);
export type ApiKeyListSortByType = z.infer<typeof ApiKeyListSortBySchema>;

export const OpenApiKeySchema = z.object({
  _id: ObjectIdSchema.meta({ description: 'API Key 记录 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  type: ApiKeyTypeSchema,
  appId: ObjectIdSchema.optional().meta({
    description: '应用 Key 绑定的应用 ID',
    example: '68ad85a7463006c963799a05'
  }),
  defaultAppId: ObjectIdSchema.optional().meta({
    description: '历史个人密钥的默认应用 ID，仅作为对话接口的目标兜底，不授予应用权限',
    example: '68ad85a7463006c963799a05'
  }),
  sourceMember: SourceMemberSchema.optional().meta({ description: '密钥当前归属成员' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  lastUsedTime: z.coerce.date().optional().meta({ description: '最后使用时间' }),
  apiKey: z.string().meta({
    description: 'API Key 脱敏值；复制明文请调用复制接口'
  }),
  canCopy: z.boolean().default(false).meta({
    description: '当前用户是否可以复制该 API Key 明文'
  }),
  authProxy: z.boolean().default(false).meta({
    description: '是否允许 API Key 在应用对话及对话管理请求中通过 authProxy 代理团队成员身份'
  }),
  appName: z.string().optional().meta({
    example: '客服助手',
    description: '历史应用级 API Key 对应应用名，仅用于展示'
  }),
  tagIds: z
    .array(ObjectIdSchema)
    .default([])
    .meta({
      example: ['68ad85a7463006c963799a05'],
      description: '个人密钥绑定的标签 ID 列表'
    }),
  tags: z.array(OpenApiTagSchema).default([]).meta({
    description: '个人密钥绑定的标签列表'
  }),
  name: z.string().default('Api Key').meta({ description: 'API Key 名称' }),
  usagePoints: z.number().default(0).meta({ description: '累计使用积分' }),
  limit: ApiKeyLimitSchema.meta({
    description: 'API Key 使用限制，未配置时表示不限制过期时间和积分用量'
  })
});
export type OpenApiKeySchemaType = z.infer<typeof OpenApiKeySchema>;

/* ============================================================================
 * API: 创建 API Key
 * Route: POST /api/support/openapi/create
 * Method: POST
 * Description: 通过登录态创建个人密钥或绑定单一应用的应用 Key。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const CreateApiKeyBodySchema = z
  .object({
    type: ApiKeyTypeSchema.optional().meta({
      description: '密钥类型，省略时创建个人密钥',
      example: ApiKeyTypeEnum.personal
    }),
    appId: ObjectIdSchema.optional().meta({
      description: '应用 Key 必填的绑定应用 ID；个人密钥不传',
      example: '68ad85a7463006c963799a05'
    }),
    name: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .meta({ example: '客户 A Key', description: 'API Key 名称' }),
    authProxy: BoolSchema.optional().meta({
      example: false,
      description:
        '个人密钥是否允许在 chat/completions 请求中代理团队成员身份；仅团队 owner 可开启，应用 Key 不支持'
    }),
    tags: OpenApiTagsInputSchema.optional().meta({
      example: ['68ad85a7463006c963799a05'],
      description: '绑定的标签 ID 列表'
    }),
    limit: ApiKeyLimitSchema.meta({
      description: 'API Key 使用限制，未配置时表示不限制过期时间和积分用量'
    })
  })
  .strict()
  .superRefine(({ type = ApiKeyTypeEnum.personal, appId, authProxy, tags }, ctx) => {
    if (type === ApiKeyTypeEnum.app) {
      if (!appId)
        ctx.addIssue({
          code: 'custom',
          path: ['appId'],
          message: 'appId is required for app keys'
        });
      if (authProxy !== undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['authProxy'],
          message: 'App keys do not support authProxy'
        });
      if (tags !== undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['tags'],
          message: 'App keys do not support personal tags'
        });
    } else if (appId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['appId'],
        message: 'Personal keys cannot bind an application'
      });
    }
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
 * Description: 获取本人个人密钥，或有管理权限的指定应用的全部应用 Key。
 * Tags: ['API Key 管理']
 * ============================================================================ */

const ApiKeyListTagsQuerySchema = queryArrayParam(OpenApiTagsInputSchema.optional());

export const GetApiKeyListQuerySchema = z
  .object({
    type: ApiKeyTypeSchema.optional().meta({
      description: '列表类型，省略时仅返回本人个人密钥',
      example: ApiKeyTypeEnum.personal
    }),
    keyword: z.string().trim().max(100).optional().meta({
      example: 'production',
      description: '按 API Key 名称或 Key 值片段搜索'
    }),
    tags: ApiKeyListTagsQuerySchema.meta({
      example: ['68ad85a7463006c963799a05'],
      description: '按标签筛选；多个标签默认要求同时包含'
    }),
    appId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '应用 Key 列表必填的应用 ID；个人列表忽略此兼容参数'
    }),
    sortBy: ApiKeyListSortBySchema.default('createTime').meta({
      example: 'createTime',
      description: 'createTime、lastUsedTime 按倒序；remainingPoints 按升序，不限额 Key 排在最后'
    })
  })
  .superRefine(({ type, appId, tags }, ctx) => {
    if (type === ApiKeyTypeEnum.app && !appId)
      ctx.addIssue({ code: 'custom', path: ['appId'], message: 'appId is required for app keys' });
    if (type === ApiKeyTypeEnum.app && tags !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['tags'],
        message: 'App keys do not support personal tags'
      });
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

export const UpdateApiKeyBodySchema = z
  .object({
    _id: ObjectIdSchema.meta({ description: 'API Key 记录 ID' }),
    name: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .optional()
      .meta({ description: 'API Key 名称', example: '客服后端' }),
    limit: ApiKeyLimitSchema,
    authProxy: BoolSchema.optional().meta({
      description: '仅个人密钥可配置身份代理',
      example: false
    }),
    tags: OpenApiTagsInputSchema.optional().meta({
      description: '仅个人密钥可配置的标签',
      example: []
    })
  })
  .strict()
  .refine(
    ({ name, limit, authProxy, tags }) =>
      name !== undefined || limit !== undefined || authProxy !== undefined || tags !== undefined,
    {
      message: 'name, limit, authProxy or tags is required'
    }
  )
  .meta(requiredAlternatives([['name'], ['limit'], ['authProxy'], ['tags']]));
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

/* ============================================================================
 * API: 复制 API Key
 * Route: POST /api/support/openapi/copy
 * Method: POST
 * Description: 返回 API Key 明文并记录用户复制审计日志。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const CopyApiKeyBodySchema = z.object({
  id: ObjectIdSchema.meta({ description: 'API Key 记录 ID' })
});
export type CopyApiKeyBodyType = z.infer<typeof CopyApiKeyBodySchema>;

export const CopyApiKeyResponseSchema = z.string().meta({
  description: 'API Key 明文'
});
export type CopyApiKeyResponseType = z.infer<typeof CopyApiKeyResponseSchema>;

/* ============================================================================
 * API: 检查 API Key 是否健康
 * Route: GET /api/support/openapi/health
 * Method: GET
 * Description: 通过 Authorization 请求头校验 API Key 是否有效，并返回用量信息。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const ApiKeyHealthHeaderSchema = z.object({
  authorization: z.string().trim().min(1).meta({
    example: 'Bearer fastgpt-xxxxxxxx',
    description: '待校验的 API Key 凭证，格式为 Bearer <apiKey>'
  })
});
export type ApiKeyHealthHeaderType = z.infer<typeof ApiKeyHealthHeaderSchema>;

export const ApiKeyHealthResponseSchema = z.object({
  type: ApiKeyTypeSchema,
  valid: z.literal(true).meta({
    description: 'API Key 是否有效'
  }),
  usagePoints: z.number().default(0).meta({
    example: 100,
    description: 'API Key 已使用积分'
  }),
  maxUsagePoints: z.number().default(-1).meta({
    example: -1,
    description: 'API Key 最大积分用量限制，-1 表示无限制'
  }),
  appId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '旧应用 API Key 绑定的应用 ID；系统 API Key 不返回'
  })
});
export type ApiKeyHealthResponseType = z.infer<typeof ApiKeyHealthResponseSchema>;

export const ApiKeyHealthErrorResponseSchema = getErrorResponse({
  message: 'APIKey invalid'
}).meta({
  description: 'API Key 无效时的统一错误响应'
});
export type ApiKeyHealthErrorResponseType = z.infer<typeof ApiKeyHealthErrorResponseSchema>;
