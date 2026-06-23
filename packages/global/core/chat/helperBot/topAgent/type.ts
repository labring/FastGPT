import z from 'zod';
import { SelectedDatasetSchema } from '../../../workflow/type/io';

// TopAgent 参数配置
export const topAgentParamsSchema = z.object({
  role: z.string().nullish(),
  taskObject: z.string().nullish(),
  systemPrompt: z.string().nullish(),
  selectedTools: z.array(z.string()).nullish(),
  selectedDatasets: z.array(z.string()).nullish(),
  fileUpload: z.boolean().nullish(),
  enableSandbox: z.boolean().nullish()
});
export type TopAgentParamsType = z.infer<typeof topAgentParamsSchema>;

export const TopAgentFormDataSchema = z.object({
  systemPrompt: z.string().optional(),
  tools: z.array(z.string()).optional().default([]),
  datasets: z.array(SelectedDatasetSchema).optional().default([]),
  fileUploadEnabled: z.boolean().optional().default(false),
  enableSandboxEnabled: z.boolean().optional().default(false),
  executionPlan: z.any().optional()
});
export type TopAgentFormDataType = z.infer<typeof TopAgentFormDataSchema>;
