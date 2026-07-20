import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { IntSchema, NumSchema } from '../../../../common/zod';

/* ============================================================================
 * API: Create an application evaluation
 * Route: POST /api/core/app/evaluation/create
 * Method: POST
 * Description: Upload a CSV dataset and create an application evaluation task
 * Tags: ['App']
 * ============================================================================ */
export const CreateEvaluationBodySchema = z
  .object({
    name: z.string().min(1).meta({
      example: 'Customer support regression',
      description: 'Evaluation task name'
    }),
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: 'Application ID'
    }),
    evalModelId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a06',
      description: 'Model ID used to score evaluation results'
    }),
    /** @deprecated Use evalModelId. */
    evalModel: z.string().min(1).optional().meta({
      deprecated: true,
      example: 'gpt-4o',
      description: 'Legacy model name used to score evaluation results'
    })
  })
  .refine(({ evalModelId, evalModel }) => evalModelId || evalModel, {
    message: 'evalModelId or evalModel is required'
  });
export type CreateEvaluationBody = z.infer<typeof CreateEvaluationBodySchema>;

export const CreateEvaluationFormSchema = CreateEvaluationBodySchema.safeExtend({
  file: z.any().meta({
    format: 'binary',
    description: 'Evaluation dataset in CSV format'
  })
});

export const CreateEvaluationResponseSchema = z.undefined().meta({
  description: 'Evaluation task created successfully'
});
export type CreateEvaluationResponse = z.infer<typeof CreateEvaluationResponseSchema>;

/* ============================================================================
 * API: List application evaluations
 * Route: POST /api/core/app/evaluation/list
 * Method: POST
 * Description: List evaluation tasks visible to the current team member
 * Tags: ['App']
 * ============================================================================ */
export const ListEvaluationsBodySchema = PaginationSchema.extend({
  searchKey: z.string().optional().meta({
    example: 'Customer support',
    description: 'Evaluation task name search keyword'
  })
});
export type ListEvaluationsBody = z.infer<typeof ListEvaluationsBodySchema>;

export const EvaluationListItemSchema = z.object({
  _id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a01',
    description: 'Evaluation task ID'
  }),
  name: z.string().meta({
    example: 'Customer support regression',
    description: 'Evaluation task name'
  }),
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: 'Evaluated application ID'
  }),
  evalModelId: z.string().meta({
    example: '68ad85a7463006c963799a06',
    description: 'Evaluation model ID; preserved when the referenced model has been deleted'
  }),
  createTime: z.coerce.date().meta({
    example: '2026-08-18T08:00:00.000Z',
    description: 'Task creation time'
  }),
  finishTime: z.coerce.date().optional().meta({
    example: '2026-08-18T08:05:00.000Z',
    description: 'Task completion time'
  }),
  errorMessage: z.string().optional().meta({
    example: 'Evaluation model is unavailable',
    description: 'Task-level error message'
  }),
  score: NumSchema.optional().meta({ example: 0.95, description: 'Overall evaluation score' }),
  executorAvatar: z.string().meta({
    example: '/api/system/img/68ad85a7463006c963799a08',
    description: 'Executor avatar URL'
  }),
  executorName: z.string().meta({ example: 'Alice', description: 'Executor display name' }),
  appAvatar: z.string().meta({
    example: '/api/system/img/68ad85a7463006c963799a09',
    description: 'Evaluated application avatar URL'
  }),
  appName: z.string().meta({ example: 'Support Agent', description: 'Application display name' }),
  completedCount: IntSchema.meta({ example: 10, description: 'Completed item count' }),
  errorCount: IntSchema.meta({ example: 0, description: 'Failed item count' }),
  totalCount: IntSchema.meta({ example: 10, description: 'Total item count' })
});
export type EvaluationListItem = z.infer<typeof EvaluationListItemSchema>;

export const ListEvaluationsResponseSchema = PaginationResponseSchema(EvaluationListItemSchema);
export type ListEvaluationsResponse = z.infer<typeof ListEvaluationsResponseSchema>;
