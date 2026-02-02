import { z } from 'zod';

// TopAgent 参数配置
export const topAgentParamsSchema = z.object({
  role: z.string().nullish(),
  taskObject: z.string().nullish(),
  selectedTools: z.array(z.string()).nullish(),
  selectedDatasets: z.array(z.string()).nullish(),
  fileUpload: z.boolean().nullish()
});
export type TopAgentParamsType = z.infer<typeof topAgentParamsSchema>;
