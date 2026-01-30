import { z } from 'zod';

// 更新插件知识库来源状态
export const UpdatePluginDatasetStatusBodySchema = z.object({
  sourceId: z.string().min(1, 'sourceId is required').describe('知识库来源ID'),
  status: z.number().describe('状态: 0 = 关闭, 1 = 开启')
});
export type UpdatePluginDatasetStatusBody = z.infer<typeof UpdatePluginDatasetStatusBodySchema>;
export type UpdatePluginDatasetStatusResponse = UpdatePluginDatasetStatusBody;
