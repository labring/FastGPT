import z from 'zod';
import {
  SystemToolChildDetailSchema,
  SystemToolDetailSchema,
  SystemToolListItemSchema
} from '../../../../../core/app/tool/systemTool/type';
import { SystemToolVersionSchema } from '../../../../../core/app/tool/systemTool/type/base';

export const GetTeamSystemPluginListQuerySchema = z.object({});

export type GetTeamSystemPluginListQueryType = z.infer<typeof GetTeamSystemPluginListQuerySchema>;

export const TeamSystemPluginListItemSchema = SystemToolListItemSchema.extend({
  isPromoted: z.boolean().optional()
});

export const GetTeamPluginListResponseSchema = z.array(TeamSystemPluginListItemSchema);
export type GetTeamPluginListResponseType = z.infer<typeof GetTeamPluginListResponseSchema>;

export const GetTeamToolDetailSourceEnum = z.enum(['system', 'team']);

export const GetTeamToolDetailQuerySchema = z.object({
  toolId: z.string(),
  version: z.string().optional(),
  source: GetTeamToolDetailSourceEnum.optional()
});

export type GetTeamToolDetailQueryType = z.infer<typeof GetTeamToolDetailQuerySchema>;

export const TeamToolDetailSchema = z.object({
  ...SystemToolDetailSchema.omit({
    associatedPluginId: true,
    hideTags: true,
    secretsVal: true,
    promoteTags: true,
    children: true // override
  }).shape,
  children: z.array(SystemToolChildDetailSchema).optional()
});
export type GetTeamToolDetailResponseType = z.infer<typeof TeamToolDetailSchema>;

export const GetTeamToolVersionsQuerySchema = z.object({
  toolId: z.string(),
  source: GetTeamToolDetailSourceEnum.optional()
});

export type GetTeamToolVersionsQueryType = z.infer<typeof GetTeamToolVersionsQuerySchema>;

export const GetTeamToolVersionsResponseSchema = z.array(SystemToolVersionSchema);
export type GetTeamToolVersionsResponseType = z.infer<typeof GetTeamToolVersionsResponseSchema>;
