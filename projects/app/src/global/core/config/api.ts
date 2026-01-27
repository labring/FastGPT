import { z } from 'zod';

// 更新插件知识库状态
export const UpdatePluginDatasetStatusBodySchema = z.object({
  sourceId: z.string().min(1, 'sourceId is required'),
  status: z.number() // 0 = 关闭, 1 = 开启
});

export type UpdatePluginDatasetStatusBody = z.infer<typeof UpdatePluginDatasetStatusBodySchema>;
export type UpdatePluginDatasetStatusResponse = UpdatePluginDatasetStatusBody;
