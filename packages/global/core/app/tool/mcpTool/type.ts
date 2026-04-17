import { SecretValueTypeSchema } from '../../../../common/secret/type';
import { JSONSchemaInputTypeSchema } from '../../jsonschema';
import z from 'zod';

export const McpToolConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: JSONSchemaInputTypeSchema
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
