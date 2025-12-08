import { z } from 'zod';

export const TopAgentFormDataSchema = z.object({
  role: z.string().optional(),
  taskObject: z.string().optional(),
  tools: z.array(z.string()).optional().default([]),
  fileUploadEnabled: z.boolean().optional().default(false)
});
export type TopAgentFormDataType = z.infer<typeof TopAgentFormDataSchema>;
