import z from 'zod';

/** 工具选择列表和画布使用的纯展示摘要；不依赖执行 Schema，避免编辑器导入循环。 */
export const ToolSetToolSummarySchema = z.object({
  name: z.string().meta({ description: '工具名称', example: 'search' }),
  description: z.string().meta({ description: '工具能力说明', example: 'Search documents' })
});
export type ToolSetToolSummaryType = z.infer<typeof ToolSetToolSummarySchema>;
