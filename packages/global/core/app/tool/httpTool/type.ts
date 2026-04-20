import { StoreSecretValueTypeSchema } from '../../../../common/secret/type';
import { JSONSchemaInputTypeSchema, JSONSchemaOutputTypeSchema } from '../../jsonschema';
import { ContentTypes } from '../../../workflow/constants';
import z from 'zod';

const PathDataTypeSchema = z.object({
  name: z.string(),
  description: z.string(),
  method: z.string(),
  path: z.string(),
  params: z.array(z.any()),
  request: z.any(),
  response: z.any()
});
export type PathDataType = z.infer<typeof PathDataTypeSchema>;

export const OpenApiJsonSchemaSchema = z.object({
  pathData: z.array(PathDataTypeSchema),
  serverPath: z.string()
});
export type OpenApiJsonSchema = z.infer<typeof OpenApiJsonSchemaSchema>;

export const HttpToolConfigTypeSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: JSONSchemaInputTypeSchema,
  outputSchema: JSONSchemaOutputTypeSchema,
  path: z.string(),
  method: z.string(),

  // manual
  staticParams: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  staticHeaders: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  staticBody: z
    .object({
      type: z.enum(ContentTypes),
      content: z.string().optional(),
      formData: z.array(z.object({ key: z.string(), value: z.string() })).optional()
    })
    .optional(),
  headerSecret: StoreSecretValueTypeSchema.optional()
});
export type HttpToolConfigType = z.infer<typeof HttpToolConfigTypeSchema>;
