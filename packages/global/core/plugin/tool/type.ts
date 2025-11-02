import { ParentIdSchema } from '../../../common/parentFolder/type';
import z from 'zod';
import { PluginStatusEnum, PluginStatusSchema } from '../type';

export const SystemToolBasicSchema = z.object({
  id: z.string(),
  parentId: ParentIdSchema,
  defaultInstalled: z.boolean().optional(),
  status: PluginStatusSchema.optional().default(PluginStatusEnum.Normal),
  name: z.string(),
  intro: z.string().optional(),
  author: z.string().optional(),
  avatar: z.string().optional(),
  originCost: z.number().optional(),
  currentCost: z.number().optional(),
  hasTokenFee: z.boolean().optional(),
  pluginOrder: z.number().optional(),
  systemKeyCost: z.number().optional(),
  tags: z.array(z.string()).optional(),
  hasSystemSecret: z.boolean().optional(),

  // App tool
  associatedPluginId: z.string().optional()
});

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
