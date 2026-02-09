import { z } from 'zod';
import { AICollectionAnswerSchema } from '../type';
import { SelectedDatasetSchema } from '@fastgpt/global/core/workflow/type/io';

// 执行计划步骤中的资源引用类型
export const StepResourceRefSchema = z.object({
  id: z.string(),
  type: z.enum(['tool', 'knowledge'])
});

// 执行计划步骤类型
export const ExecutionStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  expectedTools: z.array(StepResourceRefSchema).optional()
});

export const ExecutionPlanSchema = z.object({
  total_steps: z.number(),
  steps: z.array(ExecutionStepSchema)
});
export type ExecutionPlanType = z.infer<typeof ExecutionPlanSchema>;

export const TopAgentFormDataSchema = z.object({
  systemPrompt: z.string().optional(),
  tools: z.array(z.string()).optional().default([]),
  datasets: z.array(SelectedDatasetSchema).optional().default([]),
  fileUploadEnabled: z.boolean().optional().default(false),
  executionPlan: z.any().optional()
});
export type TopAgentFormDataType = z.infer<typeof TopAgentFormDataSchema>;

// 表单收集
export const TopAgentCollectionAnswerSchema = AICollectionAnswerSchema.extend({
  phase: z.literal('collection'),
  reasoning: z.string().nullish()
});
export const TopAgentGenerationAnswerSchema = z.object({
  phase: z.literal('generation'),
  reasoning: z.string().nullish(),
  task_analysis: z.object({
    goal: z.string(),
    role: z.string(),
    key_features: z.string()
  }),
  execution_plan: ExecutionPlanSchema.optional(),
  resources: z.object({
    system_features: z.object({
      file_upload: z.object({
        enabled: z.boolean(),
        purpose: z.string().optional()
      })
    })
  })
});
export const TopAgentAnswerSchema = z.discriminatedUnion('phase', [
  TopAgentCollectionAnswerSchema,
  TopAgentGenerationAnswerSchema
]);
export type TopAgentAnswerType = z.infer<typeof TopAgentAnswerSchema>;
export type TopAgentGenerationAnswerType = z.infer<typeof TopAgentGenerationAnswerSchema>;
