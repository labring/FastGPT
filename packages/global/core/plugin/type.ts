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

export const PluginStatusSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type PluginStatusType = z.infer<typeof PluginStatusSchema>;
export enum PluginStatusEnum {
  Normal = 1,
  SoonOffline = 2,
  Offline = 3
}
