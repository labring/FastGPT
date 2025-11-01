import { z } from 'zod';

export const I18nStringSchema = z.object({
  en: z.string(),
  'zh-CN': z.string().optional(),
  'zh-Hant': z.string().optional()
});
// I18nStringType can be either an object with language keys or a plain string
export const I18nUnioStringSchema = z.union([I18nStringSchema, z.string()]);

export const PluginToolTagSchema = z.object({
  tagId: z.string(),
  tagName: I18nUnioStringSchema,
  tagOrder: z.number(),
  isSystem: z.boolean()
});
export type PluginToolTagType = z.infer<typeof PluginToolTagSchema>;
