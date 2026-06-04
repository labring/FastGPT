import z from 'zod';
import { i18nT } from '../../common/i18n/utils';
import { I18nUnionStringSchema } from '../../common/i18n/type';

export const I18nStringSchema = z.object({
  en: z.string(),
  'zh-CN': z.string().optional(),
  'zh-Hant': z.string().optional()
});
// I18nStringType can be either an object with language keys or a plain string
export const I18nUnioStringSchema = z.union([I18nStringSchema, z.string()]);

export const PluginToolTagSchema = z.object({
  tagId: z.string(),
  tagName: I18nUnionStringSchema,
  tagOrder: z.number(),
  isSystem: z.boolean()
});

export type SystemPluginToolTagType = z.infer<typeof PluginToolTagSchema>;

export const PluginStatusSchema = z.enum(['Normal', 'SoonOffline', 'Offline']);
export const PluginStatusEnum = PluginStatusSchema.enum;
export type PluginStatusType = z.infer<typeof PluginStatusSchema>;

export const PluginStatusMap = {
  [PluginStatusEnum.Normal]: {
    label: i18nT('app:toolkit_status_normal'),
    tooltip: '',
    tagColor: 'blue' as const
  },
  [PluginStatusEnum.SoonOffline]: {
    label: i18nT('app:toolkit_status_soon_offline'),
    tooltip: i18nT('app:tool_soon_offset_tips'),
    tagColor: 'yellow' as const
  },
  [PluginStatusEnum.Offline]: {
    label: i18nT('app:toolkit_status_offline'),
    tooltip: i18nT('app:tool_offset_tips'),
    tagColor: 'red' as const
  }
};
