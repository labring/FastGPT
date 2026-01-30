import { z } from 'zod';
import { I18nStringSchema } from '../../plugin/type';

export const PluginFileItemSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  type: z.enum(['file', 'folder']),
  updateTime: z.coerce.date(),
  createTime: z.coerce.date(),
  hasChild: z.boolean().optional()
});
export type PluginFileItemType = z.infer<typeof PluginFileItemSchema>;

export const PluginDatasetServerSchema = z.object({
  pluginId: z.string(), // "feishu" | "yuque" | "wecom" | any plugin ID
  config: z.record(z.string(), z.any()) // specific config, defined by plugin
});
export type PluginDatasetServerType = z.infer<typeof PluginDatasetServerSchema>;

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

export const PluginDatasetSourceConfigSchema = z.object({
  sourceId: z.string(),
  name: I18nStringSchema,
  icon: z.string(),
  iconOutline: z.string().optional(),
  description: I18nStringSchema.optional(),
  courseUrl: z.string().optional(),
  formFields: z.array(PluginFormFieldConfigSchema)
});
export type PluginDatasetSourceConfig = z.infer<typeof PluginDatasetSourceConfigSchema>;

export const PluginFileReadContentResponseSchema = z.object({
  title: z.string().optional(),
  rawText: z.string()
});
export type PluginFileReadContentResponse = z.infer<typeof PluginFileReadContentResponseSchema>;

export const PluginFileReadResponseSchema = z.object({
  url: z.string()
});
export type PluginFileReadResponse = z.infer<typeof PluginFileReadResponseSchema>;

export const PluginDatasetDetailResponseSchema = PluginFileItemSchema;
export type PluginDatasetDetailResponse = PluginFileItemType;
