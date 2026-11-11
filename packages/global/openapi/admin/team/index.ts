import z from 'zod';
import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  AdminSwitchTeamBodySchema,
  AdminSwitchTeamResponseSchema,
  AdminTeamSelectorQuerySchema,
  AdminTeamSelectorResponseSchema,
  GetTeamsBodySchema,
  GetTeamsResponseSchema,
  GetTeamMembersResponseSchema
} from './api';

export const AdminTeamsPath: OpenAPIPath = {
  '/proApi/admin/team/getTeams': {
    post: {
      summary: '获取团队列表',
      description: '分页获取团队列表，支持按团队名称或所有者用户名搜索',
      tags: [DevApiTagsMap.adminTeams],
      requestBody: {
        content: {
          'application/json': {
            schema: GetTeamsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取团队列表',
          content: {
            'application/json': {
              schema: GetTeamsResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/admin/team/getTeamMembers': {
    get: {
      summary: '获取团队成员',
      description: '根据团队ID获取团队成员列表和团队基本信息',
      tags: [DevApiTagsMap.adminTeams],
      requestParams: {
        query: z.object({
          teamId: z.string().meta({ description: '团队ID' })
        })
      },
      responses: {
        200: {
          description: '成功获取团队成员',
          content: {
            'application/json': {
              schema: GetTeamMembersResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/team/switch': {
    put: {
      summary: '系统管理员切换任意团队',
      description:
        '系统超级管理员（root）切换到任意目标团队，按需确保团队内存在活跃的 root 成员记录并签发新会话令牌',
      tags: [DevApiTagsMap.adminTeams],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminSwitchTeamBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '切换成功并返回新会话令牌与目标团队成员信息',
          content: {
            'application/json': {
              schema: AdminSwitchTeamResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/team/list': {
    get: {
      summary: '系统管理员检索全站可切换团队列表',
      description: '按团队名称搜索全站未删除团队列表，供 root 用户在团队切换器中检索和切换',
      tags: [DevApiTagsMap.adminTeams],
      requestParams: {
        query: AdminTeamSelectorQuerySchema
      },
      responses: {
        200: {
          description: '成功返回可切换团队列表',
          content: {
            'application/json': {
              schema: AdminTeamSelectorResponseSchema
            }
          }
        }
      }
    }
  }
};
