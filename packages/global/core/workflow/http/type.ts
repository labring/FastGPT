import z from 'zod';

/** HTTP 表格字段共用的持久化结构；旧配置缺省 type 时仍作为文本处理。 */
export const HttpFormFieldSchema = z.object({
  key: z.string().meta({ description: 'HTTP 字段名，支持工作流变量' }),
  value: z.string().meta({
    description: '文本值、已授权工作流文件的运行时 URL 或 URL 数组的 JSON 字符串，支持变量'
  }),
  type: z
    .string()
    .optional()
    .meta({ description: 'file 表示 multipart 文件字段，其余值兼容为文本' })
});
export type HttpFormFieldType = z.infer<typeof HttpFormFieldSchema>;
