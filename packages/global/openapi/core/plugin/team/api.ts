import { PluginStatusEnum, PluginStatusSchema } from '../../../../core/plugin/type';
import z from 'zod';

export const GetTeamSystemPluginListQuerySchema = z.object({
  type: z.enum(['tool'])
});
export type GetTeamSystemPluginListQueryType = z.infer<typeof GetTeamSystemPluginListQuerySchema>;
export const TeamPluginToolListItemSchema = z.object({
  id: z.string(),
  avatar: z.string().optional(),
  name: z.string(),
  intro: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: PluginStatusSchema.optional().default(PluginStatusEnum.Normal),
  installed: z.boolean(),
  associatedPluginId: z.string().optional()
});
export const GetTeamPluginToolListResponseSchema = z.array(TeamPluginToolListItemSchema);
export type GetTeamPluginToolListResponseType = z.infer<typeof GetTeamPluginToolListResponseSchema>;

export const ToggleInstallPluginBodySchema = z.object({
  pluginId: z.string(),
  type: z.enum(['tool']),
  installed: z.boolean()
});
export type ToggleInstallPluginBodyType = z.infer<typeof ToggleInstallPluginBodySchema>;
