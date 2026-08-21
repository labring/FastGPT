import z from 'zod';
import { PaginationResponseSchema } from '../../../api';

export const TeamItemSchema = z.object({
  id: z.string().meta({ description: '团队ID' }),
  name: z.string().meta({ description: '团队名称' }),
  balance: z.number().meta({ description: '团队余额' }),
  createTime: z.date().meta({ description: '创建时间' }),
  ownerName: z.string().meta({ description: '团队所有者用户名' })
});

export const GetTeamsBodySchema = z.object({
  pageNum: z.number().meta({ description: '页码' }),
  pageSize: z.number().meta({ description: '每页条数' }),
  search: z.string().meta({ description: '搜索关键词（团队名称或所有者用户名）' })
});
export const GetTeamsResponseSchema = PaginationResponseSchema(TeamItemSchema);

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
