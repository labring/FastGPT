import { z } from 'zod';

export const I18nStringStrictSchema = z.object({
  en: z.string(),
  'zh-CN': z.string(),
  'zh-Hant': z.string()
});
export const PluginToolTagSchema = z.object({
  tagId: z.string(),
  tagName: z.union([z.string(), I18nStringStrictSchema]),
  tagOrder: z.number(),
  isSystem: z.boolean()
});
export type PluginToolTagType = z.infer<typeof PluginToolTagSchema>;
