import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';

/*
 * API: App / Dataset / Skill 批量资源操作
 * Route: POST /api/core/{app|dataset|ai/skill}/batch/{move|delete}
 * Method: POST
 * Description: 使用统一的资源 ID 列表执行批量移动或删除，具体资源业务由对应模块处理
 * Tags: ['Write']
 */

/**
 * 批量操作并发控制数。
 * 控制单次批量操作的并发执行任务数，在保证高吞吐的同时避免压垮 MongoDB 事务会话或连接池。
 */
export const BATCH_RESOURCE_ACTION_CONCURRENCY = 10;

const BatchResourceIdListSchema = z
  .array(ObjectIdSchema)
  .min(1)
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '资源 ID 不允许重复'
      });
    }
  })
  .meta({
    description: '需要批量操作的资源 ID 列表',
    example: ['68ad85a7463006c963799a05']
  });

const BatchMoveParentIdSchema = z.union([ObjectIdSchema, z.null()]).meta({
  description: '目标父级目录 ID；传 null 表示移动到根目录',
  example: '68ad85a7463006c963799a06'
});

/** 跨 App、Dataset、Skill 复用的批量删除请求契约。 */
export const BatchResourceDeleteBodySchema = z
  .object({
    ids: BatchResourceIdListSchema
  })
  .meta({
    description: '批量删除资源。具体资源的权限校验、子树处理和异步清理由资源模块负责'
  });
export type BatchResourceDeleteBody = z.infer<typeof BatchResourceDeleteBodySchema>;

/** 跨 App、Dataset、Skill 复用的批量移动请求契约。 */
export const BatchResourceMoveBodySchema = z
  .object({
    ids: BatchResourceIdListSchema,
    parentId: BatchMoveParentIdSchema
  })
  .meta({
    description: '批量移动资源。具体资源的目录环路、深度和权限校验由资源模块负责'
  });
export type BatchResourceMoveBody = z.infer<typeof BatchResourceMoveBodySchema>;

/** 批量资源操作的统一结果契约，允许资源模块返回部分成功。 */
export const BatchResourceActionResponseSchema = z
  .object({
    successIds: z.array(ObjectIdSchema).meta({
      description: '成功处理的请求资源 ID 列表',
      example: ['68ad85a7463006c963799a05']
    }),
    failedIds: z.array(ObjectIdSchema).meta({
      description: '处理失败的请求资源 ID 列表',
      example: []
    }),
    affectedIds: z.array(ObjectIdSchema).meta({
      description: '实际发生变化的资源 ID 列表；删除操作可包含被删除的子资源 ID',
      example: ['68ad85a7463006c963799a05']
    })
  })
  .meta({ description: '批量资源操作结果' });
export type BatchResourceActionResponse = z.infer<typeof BatchResourceActionResponseSchema>;
