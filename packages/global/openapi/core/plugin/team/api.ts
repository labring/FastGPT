import { PluginStatusEnum, PluginStatusSchema } from '../../../../core/plugin/type';
import z from 'zod';

export const GetTeamSystemPluginListQuerySchema = z.object({
  type: z.enum(['tool'])
});
export type GetTeamSystemPluginListQueryType = z.infer<typeof GetTeamSystemPluginListQuerySchema>;
export const TeamPluginListItemSchema = z.object({
  id: z.string(),
  avatar: z.string().optional(),
  name: z.string(),
  intro: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).nullish(),
  status: PluginStatusSchema.optional().default(PluginStatusEnum.Normal),
  installed: z.boolean(),
  associatedPluginId: z.string().optional()
});
export const GetTeamPluginListResponseSchema = z.array(TeamPluginListItemSchema);
export type GetTeamPluginListResponseType = z.infer<typeof GetTeamPluginListResponseSchema>;

export const ToggleInstallPluginBodySchema = z.object({
  pluginId: z.string(),
  type: z.enum(['tool']),
  installed: z.boolean()
});
export type ToggleInstallPluginBodyType = z.infer<typeof ToggleInstallPluginBodySchema>;
