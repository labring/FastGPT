import { z } from 'zod';
import { I18nStringSchema } from '../../plugin/type';

// =================== File Item Schema ===================
export const APIFileItemSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  type: z.enum(['file', 'folder']),
  updateTime: z.coerce.date(),
  createTime: z.coerce.date(),
  hasChild: z.boolean().optional()
});
export type APIFileItemType = z.infer<typeof APIFileItemSchema>;

// =================== Server Config Schemas (Legacy) ===================
export const APIFileServerSchema = z.object({
  baseUrl: z.string(),
  authorization: z.string().optional(),
  basePath: z.string().optional()
});
export type APIFileServer = z.infer<typeof APIFileServerSchema>;

export const FeishuServerSchema = z.object({
  appId: z.string(),
  appSecret: z.string().optional(),
  folderToken: z.string()
});
export type FeishuServer = z.infer<typeof FeishuServerSchema>;

export const YuqueServerSchema = z.object({
  userId: z.string(),
  token: z.string().optional(),
  basePath: z.string().optional()
});
export type YuqueServer = z.infer<typeof YuqueServerSchema>;

// =================== Plugin Dataset Server Schema ===================
export const PluginDatasetServerSchema = z.object({
  pluginId: z.string(), // "feishu" | "yuque" | "wecom" | any plugin ID
  config: z.record(z.string(), z.any()) // specific config, defined by plugin
});
export type PluginDatasetServerType = z.infer<typeof PluginDatasetServerSchema>;

// =================== Plugin Form Field Schemas ===================
export const PluginFormFieldTypeSchema = z.enum(['input', 'password', 'select', 'tree-select']);
export type PluginFormFieldType = z.infer<typeof PluginFormFieldTypeSchema>;

export const PluginFormFieldConfigSchema = z.object({
  key: z.string(),
  label: I18nStringSchema,
  type: PluginFormFieldTypeSchema,
  required: z.boolean().optional(),
  placeholder: I18nStringSchema.optional(),
  description: I18nStringSchema.optional(),
  options: z
    .array(
      z.object({
        label: I18nStringSchema,
        value: z.string()
      })
    )
    .optional()
});
export type PluginFormFieldConfig = z.infer<typeof PluginFormFieldConfigSchema>;

// =================== Plugin Dataset Source Config Schema ===================
export const PluginDatasetSourceConfigSchema = z.object({
  sourceId: z.string(),
  name: I18nStringSchema,
  icon: z.string(),
  iconOutline: z.string().optional(),
  description: I18nStringSchema.optional(),
  version: z.string().optional(),
  courseUrl: z.string().optional(),
  formFields: z.array(PluginFormFieldConfigSchema)
});
export type PluginDatasetSourceConfig = z.infer<typeof PluginDatasetSourceConfigSchema>;

// =================== API Response Schemas ===================
export const ApiFileReadContentResponseSchema = z.object({
  title: z.string().optional(),
  rawText: z.string()
});
export type ApiFileReadContentResponse = z.infer<typeof ApiFileReadContentResponseSchema>;

export const APIFileReadResponseSchema = z.object({
  url: z.string()
});
export type APIFileReadResponse = z.infer<typeof APIFileReadResponseSchema>;

export const ApiDatasetDetailResponseSchema = APIFileItemSchema;
export type ApiDatasetDetailResponse = APIFileItemType;
