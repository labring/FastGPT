import { z } from 'zod';
import { AICollectionAnswerSchema } from '../type';

export const TopAgentFormDataSchema = z.object({
  role: z.string().optional(),
  taskObject: z.string().optional(),
  tools: z.array(z.string()).optional().default([]),
  fileUploadEnabled: z.boolean().optional().default(false)
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
  resources: z.object({
    tools: z.array(z.string()),
    knowledges: z.array(z.string()),
    file_upload: z.object({
      enabled: z.boolean(),
      purpose: z.string()
    })
  })
});
export const TopAgentAnswerSchema = z.discriminatedUnion('phase', [
  TopAgentCollectionAnswerSchema,
  TopAgentGenerationAnswerSchema
]);
export type TopAgentAnswerType = z.infer<typeof TopAgentAnswerSchema>;
