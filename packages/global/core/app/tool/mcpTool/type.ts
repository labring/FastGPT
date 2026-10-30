import { SecretValueTypeSchema } from '../../../../common/secret/type';
import { JSONSchemaInputTypeSchema } from '../../jsonschema';
import z from 'zod';

export const McpToolConfigSchema = z.object({
  name: z.string().meta({
    example: 'search',
    description: 'MCP 工具名称，用于工作流节点选择和远端调用'
  }),
  description: z.string().meta({
    example: 'Search tool',
    description: 'MCP 工具能力说明，会用于工具选择和调用提示'
  }),
  inputSchema: JSONSchemaInputTypeSchema.optional().meta({
    description: 'MCP 工具入参 JSON Schema'
  }),
  // 不把 z.json() 的内部递归类型暴露到工作流 SDK 的声明文件中。
  requestMeta: z
    .record(z.string(), z.unknown())
    .refine((value) => z.json().safeParse(value).success, {
      message: 'Metadata must contain JSON values'
    })
    .optional()
    .meta({
      example: { 'example/context': { locale: 'zh-CN' } },
      description:
        '调用此工具时发送的 MCP 请求元数据，位于 tools/call 的 params._meta，独立于工具入参'
    })
});
export type McpToolConfigType = z.infer<typeof McpToolConfigSchema>;

export const McpToolSetDataTypeSchema = z.object({
  url: z.string(),
  headerSecret: SecretValueTypeSchema.optional(),
  toolList: z.array(McpToolConfigSchema)
});
export type McpToolSetDataType = z.infer<typeof McpToolSetDataTypeSchema>;

export const McpToolDataTypeSchema = McpToolConfigSchema.extend({
  url: z.string(),
  headerSecret: SecretValueTypeSchema.optional()
});
export type McpToolDataType = z.infer<typeof McpToolDataTypeSchema>;
