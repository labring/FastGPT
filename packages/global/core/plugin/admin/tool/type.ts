import { SystemToolBasicSchema, ToolSecretInputItemSchema } from '../../tool/type';
import z from 'zod';

export const AdminSystemToolListItemSchema = SystemToolBasicSchema.extend({
  isFolder: z.boolean().optional(),
  hasSecretInput: z.boolean()
});
export type AdminSystemToolListItemType = z.infer<typeof AdminSystemToolListItemSchema>;

// Child config schema for update
export const ToolsetChildSchema = z.object({
  pluginId: z.string(),
  name: z.string(),
  systemKeyCost: z.number().optional()
});
export const AdminSystemToolDetailSchema = AdminSystemToolListItemSchema.omit({
  hasSecretInput: true
}).extend({
  userGuide: z.string().nullable().optional(),
  inputList: z.array(ToolSecretInputItemSchema).optional(),
  inputListVal: z.record(z.string(), z.any()).nullable().optional(),
  childTools: z.array(ToolsetChildSchema).optional()
});
export type AdminSystemToolDetailType = z.infer<typeof AdminSystemToolDetailSchema>;
