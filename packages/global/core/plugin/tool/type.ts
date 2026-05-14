import z from 'zod';
import { PluginStatusEnum, PluginStatusSchema } from '../type';
import { UserTagsSchema } from '../../../support/user/type';

// 无论哪种 Tool，都会有这一层配置
export const SystemToolBasicConfigSchema = z.object({
  status: PluginStatusSchema.optional().default(PluginStatusEnum.Normal),
  originCost: z.number().optional(),
  currentCost: z.number().optional(),
  hasTokenFee: z.boolean().optional(),
  systemKeyCost: z.number().optional(),
  pluginOrder: z.number().optional()
});

/** SystemTool 配置数据库里面的的存储结构 */
export const SystemPluginToolCollectionSchema = SystemToolBasicConfigSchema.extend({
  pluginId: z.string(),
  promoteTags: z.array(UserTagsSchema).nullish(),
  hideTags: z.array(UserTagsSchema).nullish(),
  customConfig: z
    .object({
      name: z.string(),
      avatar: z.string().optional(),
      intro: z.string().optional(),
      toolDescription: z.string().optional(),
      version: z.string(),
      tags: z.array(z.string()).nullish(),
      associatedPluginId: z.string().optional(),
      userGuide: z.string().optional(),
      author: z.string().optional()
    })
    .optional(),
  secretsVal: z.record(z.string(), z.any()).nullish(),

  /** @deprecated */
  inputListVal: z.record(z.string(), z.any()).optional(),
  /** @deprecated */
  isActive: z.boolean().optional(),
  /** @deprecated */
  inputConfig: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string().optional(),
        value: z.any().optional()
      })
    )
    .optional()
});
export type SystemPluginToolCollectionType = z.infer<typeof SystemPluginToolCollectionSchema>;

// TODO: 移动到 plugin sdk 里
export const ToolSecretInputItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  inputType: z.enum(['input', 'numberInput', 'secret', 'switch', 'select']),
  value: z.any().optional(),
  list: z.array(z.object({ label: z.string(), value: z.string() })).optional()
});
export type ToolSecretInputItemType = z.infer<typeof ToolSecretInputItemSchema>;
