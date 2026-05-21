import z from 'zod';
import {
  SystemToolRuntimeSchema,
  SystemToolVersionSchema
} from '../../../../../core/app/tool/systemTool/type/base';
import type { AdminSystemToolDetailType } from '../../../../../core/app/tool/systemTool/type';
import {
  AdminSystemToolChildDetailSchema,
  AdminSystemToolDetailSchema,
  AdminSystemToolListItemSchema
} from '../../../../../core/app/tool/systemTool/type';

/* ============================================================================
 * API: 获取系统工具列表
 * Route: GET /api/core/plugin/admin/tool/list
 * Method: GET
 * Description: 获取系统工具列表，支持按工具名称关键字搜索
 * Tags: ['PluginToolAdmin', 'Read']
 * ============================================================================ */

export const GetAdminSystemToolsQuery = z.object({
  searchKey: z.string().max(100).optional().meta({
    example: 'search',
    description: '工具名称搜索关键字'
  })
});
export type GetAdminSystemToolsQueryType = z.infer<typeof GetAdminSystemToolsQuery>;
export const GetAdminSystemToolsResponseSchema = z.array(AdminSystemToolListItemSchema);
export type GetAdminSystemToolsResponseType = z.infer<typeof GetAdminSystemToolsResponseSchema>;

// Admin tool detail
export const GetAdminSystemToolDetailQuerySchema = z.object({
  toolId: z.string(),
  version: z.string().optional()
});
export type GetAdminSystemToolDetailQueryType = z.infer<typeof GetAdminSystemToolDetailQuerySchema>;
export type GetAdminSystemToolDetailResponseType = AdminSystemToolDetailType;

// Admin tool versions
export const GetAdminSystemToolVersionsQuerySchema = z.object({
  toolId: z.string()
});
export type GetAdminSystemToolVersionsQueryType = z.infer<
  typeof GetAdminSystemToolVersionsQuerySchema
>;
export const GetAdminSystemToolVersionsResponseSchema = z.array(SystemToolVersionSchema);
export type GetAdminSystemToolVersionsResponseType = z.infer<
  typeof GetAdminSystemToolVersionsResponseSchema
>;

// Update/reset tool runtime config
export const RuntimeConfigSchema = SystemToolRuntimeSchema;
export const GetToolRuntimeConfigQuerySchema = z.object({
  pluginId: z.string()
});
export type GetToolRuntimeConfigQueryType = z.infer<typeof GetToolRuntimeConfigQuerySchema>;
export const GetToolRuntimeConfigResponseSchema = z.object({
  runtimeConfig: RuntimeConfigSchema.optional()
});
export type GetToolRuntimeConfigResponseType = z.infer<typeof GetToolRuntimeConfigResponseSchema>;

export const UpdateToolRuntimeConfigBodySchema = z.object({
  pluginId: z.string(),
  runtimeConfig: RuntimeConfigSchema
});
export type UpdateToolRuntimeConfigBodyType = z.infer<typeof UpdateToolRuntimeConfigBodySchema>;

export const ResetToolRuntimeConfigBodySchema = z.object({
  pluginId: z.string()
});
export type ResetToolRuntimeConfigBodyType = z.infer<typeof ResetToolRuntimeConfigBodySchema>;

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
const UpdateChildToolSchema = AdminSystemToolDetailSchema.shape.children.unwrap().element.pick({
  id: true,
  systemKeyCost: true
});
const UpdateToolSecretsValSchema = z.record(z.string(), z.any()).nullable().optional();

export const UpdateSystemToolBodySchema = AdminSystemToolDetailSchema.pick({
  id: true,
  status: true,
  tags: true,
  currentCost: true,
  systemKeyCost: true,
  hasTokenFee: true,
  secretsVal: true,
  promoteTags: true,
  hideTags: true,
  originCost: true
})
  .partial()
  .extend({
    id: z.string(),
    secretsVal: UpdateToolSecretsValSchema,
    children: z.array(UpdateChildToolSchema).optional()
  });
export type UpdateSystemToolBodyType = z.infer<typeof UpdateSystemToolBodySchema>;

// Update workflow tool Schema
export const UpdateWorkflowToolBodySchema = AdminSystemToolDetailSchema.pick({
  id: true,
  status: true,
  name: true,
  avatar: true,
  intro: true,
  author: true,
  tags: true,
  userGuide: true,
  currentCost: true,
  systemKeyCost: true,
  hasTokenFee: true,
  secretsVal: true,
  promoteTags: true,
  hideTags: true,
  originCost: true
})
  .partial()
  .extend({
    id: z.string(),
    secretsVal: UpdateToolSecretsValSchema,
    associatedPluginId: z.string().optional()
  });
export type UpdateWorkflowToolBodyType = z.infer<typeof UpdateWorkflowToolBodySchema>;

// Create app type tool
export const CreateAppToolBodySchema = UpdateWorkflowToolBodySchema.omit({
  id: true
}).extend({
  name: z.string(),
  avatar: z.string(),
  intro: z.string(),
  associatedPluginId: z.string(),
  originCost: z.number().optional()
});
export type CreateAppToolBodyType = z.infer<typeof CreateAppToolBodySchema>;

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
