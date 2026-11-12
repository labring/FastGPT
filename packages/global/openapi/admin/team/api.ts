import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { IntSchema } from '../../../common/zod';
import {
  PaginationPageSizeSchema,
  PaginationResponseSchema,
  createPaginationSchema
} from '../../api';

/* ============================================================================
 * API: 获取团队列表
 * Route: POST /proApi/admin/team/getTeams
 * Method: POST
 * Description: 分页获取团队列表，支持按团队名称或所有者用户名搜索
 * Tags: ['Admin', 'Teams', 'Read']
 * ============================================================================ */

export const TeamItemSchema = z.object({
  id: z.string().meta({ description: '团队ID' }),
  name: z.string().meta({ description: '团队名称' }),
  balance: z.number().meta({ description: '团队余额' }),
  createTime: z.date().meta({ description: '创建时间' }),
  ownerName: z.string().optional().meta({ description: '团队所有者用户名' })
});

export const GetTeamsBodySchema = createPaginationSchema({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .meta({ description: '搜索关键词（团队名称或所有者用户名）' })
});
export type GetTeamsBodyType = z.infer<typeof GetTeamsBodySchema>;

export const GetTeamsResponseSchema = PaginationResponseSchema(TeamItemSchema);
export type GetTeamsResponseType = z.infer<typeof GetTeamsResponseSchema>;

export const TeamMemberItemSchema = z.object({
  userName: z.string().default('').meta({ description: '成员用户名' }),
  teamId: z.string().meta({ description: '团队ID' }),
  role: z.string().meta({ description: '成员角色' }),
  status: z.string().meta({ description: '成员状态' })
});

export const GetTeamMembersQuerySchema = z.object({
  teamId: z.string().meta({ description: '团队ID' })
});
export type GetTeamMembersQueryType = z.infer<typeof GetTeamMembersQuerySchema>;

export const GetTeamMembersResponseSchema = z.object({
  members: z.array(TeamMemberItemSchema).meta({ description: '团队成员列表' }),
  team: z
    .object({
      _id: ObjectIdSchema.meta({ description: '团队ID' }),
      name: z.string().meta({ description: '团队名称' })
    })
    .meta({ description: '团队基本信息' })
});
export type GetTeamMembersResponseType = z.infer<typeof GetTeamMembersResponseSchema>;

/* ============================================================================
 * API: 系统管理员切换任意团队
 * Route: PUT /api/admin/team/switch
 * Method: PUT
 * Description: 系统超级管理员（root）切换到指定团队，按需确保团队内存在活跃的 root 成员记录并签发新会话令牌
 * Tags: ['Admin', 'Teams', 'Write']
 * ============================================================================ */

export const AdminSwitchTeamBodySchema = z
  .object({
    teamId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '要切换到的目标团队 ID'
    })
  })
  .meta({
    example: {
      teamId: '68ad85a7463006c963799a06'
    }
  });
export type AdminSwitchTeamBodyType = z.infer<typeof AdminSwitchTeamBodySchema>;

export const AdminSwitchTeamResponseSchema = z.object({
  token: z.string().meta({
    example: '68ad85a7463006c963799a05:abc123def456',
    description: '切换团队后生成的新登录会话令牌，同时写入登录 Cookie'
  }),
  teamId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '切换后的当前团队 ID'
  }),
  tmbId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a07',
    description: 'root 用户在目标团队中的成员 ID'
  })
});
export type AdminSwitchTeamResponseType = z.infer<typeof AdminSwitchTeamResponseSchema>;

/* ============================================================================
 * API: 系统管理员分页检索全站可切换团队列表
 * Route: GET /api/admin/team/list
 * Method: GET
 * Description: 供系统超级管理员（root）在团队切换器中分页及按团队名检索全站可用团队列表，无搜索词时置顶当前所处团队
 * Tags: ['Admin', 'Teams', 'Read']
 * ============================================================================ */

export const AdminTeamSelectorItemSchema = z.object({
  teamId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '团队 ID'
  }),
  teamName: z.string().meta({
    example: 'My Team',
    description: '团队名称'
  }),
  avatar: z.string().nullish().meta({
    example: '/icon/logo.svg',
    description: '团队头像'
  })
});
export type AdminTeamSelectorItemType = z.infer<typeof AdminTeamSelectorItemSchema>;

export const AdminTeamSelectorQuerySchema = z.object({
  offset: IntSchema.optional().meta({
    example: 0,
    description: '分页偏移量，从 0 开始；传入时优先于 pageNum'
  }),
  pageNum: IntSchema.positive().optional().default(1).meta({
    example: 1,
    description: '页码，从 1 开始；传入 offset 时忽略'
  }),
  pageSize: PaginationPageSizeSchema.optional(),
  search: z.string().trim().max(100).optional().meta({
    example: 'My Team',
    description: '按团队名称模糊搜索关键词'
  })
});
export type AdminTeamSelectorQueryType = z.infer<typeof AdminTeamSelectorQuerySchema>;

export const AdminTeamSelectorResponseSchema = PaginationResponseSchema(
  AdminTeamSelectorItemSchema
);
export type AdminTeamSelectorResponseType = z.infer<typeof AdminTeamSelectorResponseSchema>;
