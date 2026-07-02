import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { BoolSchema, IntSchema } from '../../../common/zod';

export const OpenApiTagTypeSchema = z.enum(['system', 'custom']);

export const OpenApiTagSchema = z.object({
  _id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '标签 ID'
  }),
  name: z.string().meta({
    example: '客户 A',
    description: '标签名称'
  }),
  type: OpenApiTagTypeSchema.meta({
    example: 'custom',
    description: '标签类型；system 仅用于兼容历史数据，新标签均为 custom'
  }),
  order: z.number().meta({
    example: 10,
    description: '排序值'
  }),
  createTime: z.coerce.date().meta({
    description: '创建时间'
  }),
  updateTime: z.coerce.date().meta({
    description: '更新时间'
  }),
  keyCount: IntSchema.optional().meta({
    example: 12,
    description: '绑定该标签的 API Key 数量'
  })
});
export type OpenApiTagType = z.infer<typeof OpenApiTagSchema>;

export const OpenApiTagsInputSchema = z
  .array(ObjectIdSchema)
  .max(20)
  .meta({
    example: ['68ad85a7463006c963799a05'],
    description: '标签 ID 列表'
  });
export type OpenApiTagsInputType = z.infer<typeof OpenApiTagsInputSchema>;

/* ============================================================================
 * API: 获取 API Key 标签列表
 * Route: GET /api/support/openapi/tag/list
 * Method: GET
 * Description: 获取当前登录成员的 API Key 标签列表。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const GetOpenApiTagListQuerySchema = z.object({
  withKeyCount: BoolSchema.optional().meta({
    example: false,
    description: '是否返回每个标签绑定的 API Key 数量'
  })
});
export type GetOpenApiTagListQueryType = z.infer<typeof GetOpenApiTagListQuerySchema>;

export const GetOpenApiTagListResponseSchema = z.array(OpenApiTagSchema).meta({
  description: 'API Key 标签列表'
});
export type GetOpenApiTagListResponseType = z.infer<typeof GetOpenApiTagListResponseSchema>;

/* ============================================================================
 * API: 创建 API Key 标签
 * Route: POST /api/support/openapi/tag/create
 * Method: POST
 * Description: 创建当前登录成员的 API Key 自定义标签。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const CreateOpenApiTagBodySchema = z.object({
  name: z.string().trim().min(1).max(50).meta({
    example: '客户 A',
    description: '标签名称'
  })
});
export type CreateOpenApiTagBodyType = z.infer<typeof CreateOpenApiTagBodySchema>;

export const CreateOpenApiTagResponseSchema = OpenApiTagSchema.meta({
  description: '新创建的 API Key 标签'
});
export type CreateOpenApiTagResponseType = z.infer<typeof CreateOpenApiTagResponseSchema>;

/* ============================================================================
 * API: 更新 API Key 标签
 * Route: PUT /api/support/openapi/tag/update
 * Method: PUT
 * Description: 更新当前登录成员的 API Key 标签。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const UpdateOpenApiTagBodySchema = z
  .object({
    tagId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '标签 ID'
    }),
    name: z.string().trim().min(1).max(50).optional().meta({
      example: '客户 A',
      description: '标签名称'
    }),
    order: IntSchema.optional().meta({
      example: 10,
      description: '排序值'
    })
  })
  .refine(({ name, order }) => name !== undefined || order !== undefined, {
    message: 'name or order is required'
  });
export type UpdateOpenApiTagBodyType = z.infer<typeof UpdateOpenApiTagBodySchema>;

export const UpdateOpenApiTagResponseSchema = z.undefined().meta({
  description: '更新成功'
});
export type UpdateOpenApiTagResponseType = z.infer<typeof UpdateOpenApiTagResponseSchema>;

/* ============================================================================
 * API: 删除 API Key 标签
 * Route: DELETE /api/support/openapi/tag/delete
 * Method: DELETE
 * Description: 删除当前登录成员的 API Key 自定义标签，并从 API Key 绑定中解绑。
 * Tags: ['API Key 管理']
 * ============================================================================ */

export const DeleteOpenApiTagQuerySchema = z.object({
  tagId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '标签 ID'
  })
});
export type DeleteOpenApiTagQueryType = z.infer<typeof DeleteOpenApiTagQuerySchema>;

export const DeleteOpenApiTagResponseSchema = z.undefined().meta({
  description: '删除成功'
});
export type DeleteOpenApiTagResponseType = z.infer<typeof DeleteOpenApiTagResponseSchema>;
