import type { AdminSystemToolDetailSchema } from '../../../../../core/plugin/admin/tool/type';
import {
  AdminSystemToolListItemSchema,
  ToolsetChildSchema
} from '../../../../../core/plugin/admin/tool/type';
import z from 'zod';
import { ParentIdSchema } from '../../../../../common/parentFolder/type';
import { PluginStatusSchema } from '../../../../../core/plugin/type';

// Admin tool list
export const GetAdminSystemToolsQuery = z.object({
  parentId: ParentIdSchema
});
export type GetAdminSystemToolsQueryType = z.infer<typeof GetAdminSystemToolsQuery>;
export const GetAdminSystemToolsResponseSchema = z.array(AdminSystemToolListItemSchema);
export type GetAdminSystemToolsResponseType = z.infer<typeof GetAdminSystemToolsResponseSchema>;

// Admin tool detail
export const GetAdminSystemToolDetailQuerySchema = z.object({
  toolId: z.string()
});
export type GetAdminSystemToolDetailQueryType = z.infer<typeof GetAdminSystemToolDetailQuerySchema>;
export type GetAdminSystemToolDetailResponseType = z.infer<typeof AdminSystemToolDetailSchema>;

// Update Tool Order Schema
export const UpdateToolOrderBodySchema = z.object({
  plugins: z.array(
    z.object({
      pluginId: z.string(),
      pluginOrder: z.number()
    })
  )
});
export type UpdateToolOrderBodyType = z.infer<typeof UpdateToolOrderBodySchema>;

// Update system tool Schema
const UpdateChildToolSchema = ToolsetChildSchema.omit({
  name: true
});
export const UpdateToolBodySchema = z.object({
  pluginId: z.string(),
  status: PluginStatusSchema.optional(),
  defaultInstalled: z.boolean().optional(),
  originCost: z.number().optional(),
  currentCost: z.number().nullish(),
  systemKeyCost: z.number().optional(),
  hasTokenFee: z.boolean().optional(),
  inputListVal: z.record(z.string(), z.any()).nullish(),
  childTools: z.array(UpdateChildToolSchema).optional(),

  // App tool fields
  name: z.string().optional(),
  avatar: z.string().optional(),
  intro: z.string().optional(),
  tagIds: z.array(z.string()).nullish(),
  associatedPluginId: z.string().optional(),
  userGuide: z.string().nullish(),
  author: z.string().optional()
});
export type UpdateToolBodyType = z.infer<typeof UpdateToolBodySchema>;

// Delete system Tool
export const DeleteSystemToolQuerySchema = z.object({
  toolId: z.string()
});
export type DeleteSystemToolQueryType = z.infer<typeof DeleteSystemToolQuerySchema>;

/* ======= App type tool ====== */
// Get all system plugin apps
export const GetAllSystemAppsBodySchema = z.object({
  searchKey: z.string().optional()
});
export type GetAllSystemAppsBodyType = z.infer<typeof GetAllSystemAppsBodySchema>;
export const GetAllSystemAppsResponseSchema = z.array(
  z.object({
    _id: z.string(),
    avatar: z.string(),
    name: z.string()
  })
);
export type GetAllSystemAppTypeToolsResponse = z.infer<typeof GetAllSystemAppsResponseSchema>;

// Create app type tool
export const CreateAppToolBodySchema = UpdateToolBodySchema.omit({
  childTools: true
});
export type CreateAppToolBodyType = z.infer<typeof CreateAppToolBodySchema>;
