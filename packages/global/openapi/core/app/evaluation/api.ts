import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { IntSchema, NumSchema } from '../../../../common/zod';
import { EvaluationStatusEnum } from '../../../../core/app/evaluation/constants';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';

const EvaluationIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '评测任务 ID'
});

const EvaluationItemIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a06',
  description: '评测项 ID'
});

const EvaluationStatusSchema = z.nativeEnum(EvaluationStatusEnum).meta({
  example: EvaluationStatusEnum.completed,
  description: '评测项状态：0-排队中，1-评测中，2-已完成'
});

/* ==========================================================================
 * API: 创建应用评测
 * Route: POST /api/proApi/core/app/evaluation/create
 * Method: POST
 * Description: 上传 CSV 评测文件，创建应用评测任务并异步执行。
 * Tags: ['应用评测']
 * ========================================================================== */

export const CreateEvaluationBodySchema = z
  .object({
    name: z.string().min(1).meta({
      example: '客服问答评测',
      description: '评测任务名称'
    }),
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '待评测应用 ID'
    }),
    evalModelId: ObjectIdSchema.meta({
      description: '用于评测答案的模型 ID'
    })
  })
  .meta({
    example: {
      name: '客服问答评测',
      appId: '68ad85a7463006c963799a05',
      evalModelId: '68ad85a7463006c963799a06'
    }
  });
export type CreateEvaluationBodyType = z.infer<typeof CreateEvaluationBodySchema>;

export const CreateEvaluationFormSchema = z.object({
  file: z.any().meta({
    format: 'binary',
    description: 'CSV 评测文件，包含 *q 问题列和 *a 期望答案列'
  }),
  data: z.string().meta({
    description: '评测参数 JSON 字符串，内容见 CreateEvaluationBodySchema'
  })
});
export type CreateEvaluationFormType = z.infer<typeof CreateEvaluationFormSchema>;

/* ==========================================================================
 * API: 删除应用评测
 * Route: DELETE /api/proApi/core/app/evaluation/delete
 * Method: DELETE
 * Description: 删除评测任务、评测项及其后台任务。
 * Tags: ['应用评测']
 * ========================================================================== */

export const DeleteEvaluationQuerySchema = z.object({
  evalId: EvaluationIdSchema
});
export type DeleteEvaluationQueryType = z.infer<typeof DeleteEvaluationQuerySchema>;

/* ==========================================================================
 * API: 删除应用评测项
 * Route: DELETE /api/proApi/core/app/evaluation/deleteItem
 * Method: DELETE
 * Description: 删除指定评测任务中的一个评测项。
 * Tags: ['应用评测']
 * ========================================================================== */

export const DeleteEvaluationItemQuerySchema = z.object({
  evalId: EvaluationIdSchema,
  itemId: EvaluationItemIdSchema
});
export type DeleteEvaluationItemQueryType = z.infer<typeof DeleteEvaluationItemQuerySchema>;

/* ==========================================================================
 * API: 导出应用评测项
 * Route: POST /api/proApi/core/app/evaluation/exportItems
 * Method: POST
 * Description: 将评测任务的评测项导出为 CSV 文件。
 * Tags: ['应用评测']
 * ========================================================================== */

export const ExportEvaluationItemsQuerySchema = z.object({
  evalId: EvaluationIdSchema
});
export type ExportEvaluationItemsQueryType = z.infer<typeof ExportEvaluationItemsQuerySchema>;

export const ExportEvaluationItemsBodySchema = z.object({
  title: z.string().min(1).meta({
    example: '问题,期望答案,实际答案,状态,得分',
    description: 'CSV 固定列标题，使用英文逗号分隔'
  }),
  statusMap: z.record(
    z.string(),
    z.object({
      label: z.string().meta({
        example: '已完成',
        description: '评测状态展示名称'
      })
    })
  )
});
export type ExportEvaluationItemsBodyType = z.infer<typeof ExportEvaluationItemsBodySchema>;

export const ExportEvaluationItemsResponseSchema = z.string().meta({
  description: '导出的 CSV 文件内容'
});
export type ExportEvaluationItemsResponseType = z.infer<typeof ExportEvaluationItemsResponseSchema>;

/* ==========================================================================
 * API: 获取应用评测列表
 * Route: POST /api/proApi/core/app/evaluation/list
 * Method: POST
 * Description: 分页获取当前团队可见的应用评测任务及执行统计。
 * Tags: ['应用评测']
 * ========================================================================== */

export const ListEvaluationsBodySchema = PaginationSchema.extend({
  searchKey: z.string().optional().meta({
    example: '客服',
    description: '评测任务名称搜索关键词'
  })
});
export type ListEvaluationsBodyType = z.infer<typeof ListEvaluationsBodySchema>;

export const EvaluationListItemSchema = z.object({
  _id: EvaluationIdSchema.meta({ description: '评测任务 ID' }),
  appId: ObjectIdSchema.meta({ description: '应用 ID' }),
  name: z.string().meta({ example: '客服问答评测', description: '评测任务名称' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  finishTime: z.coerce.date().nullish().meta({ description: '完成时间' }),
  evalModelId: ObjectIdSchema.optional().meta({ description: '评测模型 ID' }),
  evalModel: z.string().optional().meta({
    example: 'gpt-4o-mini',
    description: '旧评测模型标识',
    deprecated: true
  }),
  errorMessage: z.string().nullish().meta({ description: '评测任务错误信息' }),
  score: NumSchema.nullish().meta({ example: 0.85, description: '评测平均得分' }),
  executorAvatar: z.string().nullish().meta({ description: '执行成员头像' }),
  executorName: z.string().nullish().meta({ description: '执行成员名称' }),
  appAvatar: z.string().nullish().meta({ description: '应用头像' }),
  appName: z.string().meta({ example: '客服应用', description: '应用名称' }),
  completedCount: IntSchema.meta({ example: 8, description: '已完成评测项数量' }),
  errorCount: IntSchema.meta({ example: 1, description: '出错评测项数量' }),
  totalCount: IntSchema.meta({ example: 10, description: '评测项总数量' })
});
export type EvaluationListItemType = z.infer<typeof EvaluationListItemSchema>;

export const ListEvaluationsResponseSchema = PaginationResponseSchema(
  EvaluationListItemSchema
).meta({ description: '应用评测任务分页列表' });
export type ListEvaluationsResponseType = z.infer<typeof ListEvaluationsResponseSchema>;

/* ==========================================================================
 * API: 获取应用评测项列表
 * Route: POST /api/proApi/core/app/evaluation/listItems
 * Method: POST
 * Description: 分页获取评测任务中的评测项，按执行状态排序。
 * Tags: ['应用评测']
 * ========================================================================== */

export const ListEvaluationItemsBodySchema = PaginationSchema.extend({
  evalId: EvaluationIdSchema
});
export type ListEvaluationItemsBodyType = z.infer<typeof ListEvaluationItemsBodySchema>;

export const EvaluationItemListItemSchema = z.object({
  evalItemId: EvaluationItemIdSchema,
  evalId: EvaluationIdSchema,
  retry: IntSchema.meta({ example: 3, description: '剩余重试次数' }),
  question: z.string().meta({ example: '如何重置密码？', description: '用户问题' }),
  expectedResponse: z
    .string()
    .meta({ example: '请在登录页点击忘记密码。', description: '期望答案' }),
  response: z.string().nullish().meta({ description: '应用实际回答' }),
  globalVariables: z.record(z.string(), z.unknown()).nullish().meta({ description: '评测项变量' }),
  status: EvaluationStatusSchema,
  errorMessage: z.string().nullish().meta({ description: '评测项错误信息' }),
  accuracy: NumSchema.nullish().meta({ description: '准确性评分' }),
  relevance: NumSchema.nullish().meta({ description: '相关性评分' }),
  semanticAccuracy: NumSchema.nullish().meta({ description: '语义准确性评分' }),
  score: NumSchema.nullish().meta({ description: '评测项得分' })
});
export type EvaluationItemListItemType = z.infer<typeof EvaluationItemListItemSchema>;

export const ListEvaluationItemsResponseSchema = PaginationResponseSchema(
  EvaluationItemListItemSchema
).meta({ description: '应用评测项分页列表' });
export type ListEvaluationItemsResponseType = z.infer<typeof ListEvaluationItemsResponseSchema>;

/* ==========================================================================
 * API: 重试应用评测项
 * Route: POST /api/proApi/core/app/evaluation/retryItem
 * Method: POST
 * Description: 重置指定评测项并重新加入评测队列。
 * Tags: ['应用评测']
 * ========================================================================== */

export const RetryEvaluationItemBodySchema = z.object({
  evalItemId: EvaluationItemIdSchema
});
export type RetryEvaluationItemBodyType = z.infer<typeof RetryEvaluationItemBodySchema>;

/* ==========================================================================
 * API: 更新应用评测项
 * Route: POST /api/proApi/core/app/evaluation/updateItem
 * Method: POST
 * Description: 更新评测项问题、期望答案和变量，并重新加入评测队列。
 * Tags: ['应用评测']
 * ========================================================================== */

export const UpdateEvaluationItemBodySchema = z.object({
  evalItemId: EvaluationItemIdSchema,
  question: z.string().meta({ example: '如何重置密码？', description: '用户问题' }),
  expectedResponse: z.string().meta({
    example: '请在登录页点击忘记密码。',
    description: '期望答案'
  }),
  variables: z.record(z.string(), z.string()).meta({ description: '评测项变量' })
});
export type UpdateEvaluationItemBodyType = z.infer<typeof UpdateEvaluationItemBodySchema>;
