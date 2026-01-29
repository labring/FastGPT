import z from 'zod';
import { PluginStatusEnum, PluginStatusSchema } from '../type';

// 无论哪种 Tool，都会有这一层配置
export const SystemToolBasicConfigSchema = z.object({
  defaultInstalled: z.boolean().optional(),
  status: PluginStatusSchema.optional().default(PluginStatusEnum.Normal),
  originCost: z.number().optional(),
  currentCost: z.number().optional(),
  hasTokenFee: z.boolean().optional(),
  systemKeyCost: z.number().optional(),
  pluginOrder: z.number().optional()
});

export const SystemPluginToolCollectionSchema = SystemToolBasicConfigSchema.extend({
  pluginId: z.string(),
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
  inputListVal: z.record(z.string(), z.any()).optional(),

  // @deprecated
  isActive: z.boolean().optional(),
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
