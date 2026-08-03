import z from 'zod';
import { BoolSchema } from '../../../../../common/zod';
import {
  SystemToolChildDetailSchema,
  SystemToolDetailSchema,
  SystemToolListItemSchema
} from '../../../../../core/app/tool/systemTool/type';
import { SystemToolVersionSchema } from '../../../../../core/app/tool/systemTool/type/base';
import {
  TeamPluginInstallSourceSchema,
  TeamPluginPolicyStatusSchema,
  TeamPluginRegistrySourceSchema
} from '../../../../../core/plugin/schema/type';

/* ============================================================================
 * API: 获取团队插件列表
 * Route: GET /api/core/plugin/team/tool/list
 * Method: GET
 * Description: 获取当前团队可用的插件和系统工具列表
 * Tags: ['团队插件管理', 'Read']
 * ============================================================================ */

export const GetTeamSystemPluginListQuerySchema = z.object({
  includeDeleted: BoolSchema.optional().meta({
    example: true,
    description: '是否包含团队已删除插件记录'
  }),
  includeDebug: BoolSchema.optional().meta({
    example: false,
    description: '是否包含当前调试插件 source'
  }),
  source: z.enum(['all', 'system', 'team']).optional().meta({
    example: 'team',
    description: '按插件注册来源筛选'
  })
});

export type GetTeamSystemPluginListQueryType = z.infer<typeof GetTeamSystemPluginListQuerySchema>;

export const TeamSystemPluginListItemSchema = SystemToolListItemSchema.extend({
  isPromoted: z.boolean().optional(),
  registrySource: TeamPluginRegistrySourceSchema.optional().meta({
    example: 'team',
    description: '插件注册来源'
  }),
  installSource: TeamPluginInstallSourceSchema.optional().meta({
    example: 'marketplace',
    description: '团队安装来源'
  }),
  teamInstallStatus: z
    .union([TeamPluginPolicyStatusSchema, z.literal('system')])
    .optional()
    .meta({
      example: 'installed',
      description: '当前团队视角下的插件策略状态'
    }),
  confirmedPermissions: z
    .array(z.string())
    .optional()
    .meta({
      example: ['userInfo:read'],
      description: '安装时确认过的权限清单'
    }),
  installedVersion: z.string().optional().meta({
    example: '1.0.0',
    description: '团队安装版本'
  }),
  installedEtag: z.string().optional().meta({
    example: 'sha256:xxx',
    description: '团队安装包 etag'
  }),
  canManage: z.boolean().optional().meta({
    example: true,
    description: '当前成员是否可管理团队插件'
  })
});

export const GetTeamPluginListResponseSchema = z.array(TeamSystemPluginListItemSchema);
export type GetTeamPluginListResponseType = z.infer<typeof GetTeamPluginListResponseSchema>;

export const GetTeamToolDetailSourceSchema = z.union([
  z.literal('system'),
  z.string().regex(/^teamId:[^:]+$/),
  z.string().regex(/^debug:tmbId:[^:]+$/)
]);

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
  source: GetTeamToolDetailSourceSchema.optional().meta({
    example: 'debug:tmbId:tmb_xxx',
    description:
      '工具来源。system 表示系统工具，teamId:* 表示团队工具，debug:tmbId:* 表示当前调试来源'
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

/* ============================================================================
 * API: 删除团队安装插件
 * Route: POST /api/core/plugin/team/tool/delete
 * Method: POST
 * Description: 删除当前团队 source 下的插件包，并把团队账本收敛为 deleted
 * Tags: ['团队插件管理', 'Delete']
 * ============================================================================ */

export const DeleteTeamToolBodySchema = z.object({
  pluginId: z.string().meta({
    example: 'systemTool-weather',
    description: '团队插件 ID，支持带 systemTool- 前缀'
  }),
  version: z.string().optional().meta({
    example: '1.0.0',
    description: '插件版本；为空时使用团队账本记录的版本'
  })
});
export type DeleteTeamToolBodyType = z.infer<typeof DeleteTeamToolBodySchema>;
