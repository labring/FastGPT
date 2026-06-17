import z from 'zod';
import {
  SystemToolChildDetailSchema,
  SystemToolDetailSchema,
  SystemToolListItemSchema
} from '../../../../../core/app/tool/systemTool/type';
import { SystemToolVersionSchema } from '../../../../../core/app/tool/systemTool/type/base';

/* ============================================================================
 * API: 获取团队插件列表
 * Route: GET /api/core/plugin/team/tool/list
 * Method: GET
 * Description: 获取当前团队可用的插件和系统工具列表
 * Tags: ['团队插件管理', 'Read']
 * ============================================================================ */

export const GetTeamSystemPluginListQuerySchema = z.object({});

export type GetTeamSystemPluginListQueryType = z.infer<typeof GetTeamSystemPluginListQuerySchema>;

export const TeamSystemPluginListItemSchema = SystemToolListItemSchema.extend({
  isPromoted: z.boolean().optional()
});

export const GetTeamPluginListResponseSchema = z.array(TeamSystemPluginListItemSchema);
export type GetTeamPluginListResponseType = z.infer<typeof GetTeamPluginListResponseSchema>;

export const GetTeamToolDetailSourceEnum = z.enum(['system', 'team']);

/* ============================================================================
 * API: 获取团队工具详情
 * Route: GET /api/core/plugin/team/tool/detail
 * Method: GET
 * Description: 获取当前团队视角下的工具详情，支持系统工具和团队工具来源
 * Tags: ['团队插件管理', 'Read']
 * ============================================================================ */

export const GetTeamToolDetailQuerySchema = z.object({
  toolId: z.string().meta({
    example: 'systemTool-weather',
    description: '工具 ID，支持系统工具、团队工具和工具集子工具 ID'
  }),
  version: z.string().optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '工具版本 ID。为空时返回最新版本详情'
  }),
  source: GetTeamToolDetailSourceEnum.optional().meta({
    example: 'system',
    description: '工具来源。system 表示系统工具，team 表示当前团队工具'
  })
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

export const OpenAPITeamToolDetailSchema = TeamToolDetailSchema;

/* ============================================================================
 * API: 获取团队工具版本列表
 * Route: GET /api/core/plugin/team/tool/versions
 * Method: GET
 * Description: 获取当前团队视角下的工具版本列表，工作流工具返回关联应用版本 ID 和版本名称
 * Tags: ['团队插件管理', 'Read']
 * ============================================================================ */

export const GetTeamToolVersionsQuerySchema = GetTeamToolDetailQuerySchema.pick({
  toolId: true,
  source: true
});

export type GetTeamToolVersionsQueryType = z.infer<typeof GetTeamToolVersionsQuerySchema>;

export const GetTeamToolVersionsResponseSchema = z.array(SystemToolVersionSchema);
export type GetTeamToolVersionsResponseType = z.infer<typeof GetTeamToolVersionsResponseSchema>;
