import z from 'zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';

/* ============================================================================
 * API: 获取团队列表
 * Route: POST /admin/routes/teams/getTeams
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

export const GetTeamsBodySchema = PaginationSchema.extend({
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
  userName: z.string().meta({ description: '成员用户名' }),
  teamId: z.string().meta({ description: '团队ID' }),
  role: z.string().meta({ description: '成员角色' }),
  status: z.string().meta({ description: '成员状态' })
});

export const GetTeamMembersResponseSchema = z.object({
  members: z.array(TeamMemberItemSchema).meta({ description: '团队成员列表' }),
  team: z
    .object({
      _id: z.string().meta({ description: '团队ID' }),
      name: z.string().meta({ description: '团队名称' })
    })
    .meta({ description: '团队基本信息' })
});

export const UpdateTeamBodySchema = z.object({
  id: z.string().meta({ description: '团队ID' }),
  name: z.string().optional().meta({ description: '新团队名称' }),
  balance: z.number().optional().meta({ description: '新余额' })
});

export const UpdateTeamResponseSchema = z.object({
  balance: z.number().optional().meta({ description: '更新后的余额' })
});
