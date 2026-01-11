import { ParentIdSchema } from '../../../../common/parentFolder/type';
import { SystemToolBasicConfigSchema, ToolSecretInputItemSchema } from '../../tool/type';
import z from 'zod';
import { UserTagsEnum } from '../../../../support/user/type';

export const AdminSystemToolListItemSchema = SystemToolBasicConfigSchema.extend({
  id: z.string(),
  parentId: ParentIdSchema,
  name: z.string(),
  intro: z.string().optional(),
  author: z.string().optional(),
  avatar: z.string().optional(),
  tags: z.array(z.string()).nullish(),

  hasSystemSecret: z.boolean().optional(),

  // App tool
  associatedPluginId: z.string().optional(),

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
  userGuide: z.string().nullish(),
  inputList: z.array(ToolSecretInputItemSchema).optional(),
  inputListVal: z.record(z.string(), z.any()).nullish(),
  childTools: z.array(ToolsetChildSchema).optional(),
  promoteTags: z.array(UserTagsEnum).nullish().describe('对拥有这些 Tag 的用户推荐, 排序到前面'),
  hideTags: z.array(UserTagsEnum).nullish().describe('对拥有这些 Tag 的用户隐藏')
});
export type AdminSystemToolDetailType = z.infer<typeof AdminSystemToolDetailSchema>;
