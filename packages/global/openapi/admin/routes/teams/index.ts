import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetTeamsBodySchema,
  GetTeamsResponseSchema,
  GetTeamMembersResponseSchema,
  UpdateTeamBodySchema,
  UpdateTeamResponseSchema
} from './api';

export const AdminTeamsPath: OpenAPIPath = {
  '/admin/routes/teams/getTeams': {
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
  '/admin/routes/teams/getTeamMembers': {
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
  '/admin/routes/teams/updateTeam': {
    post: {
      summary: '更新团队信息',
      description: '管理员修改团队的名称或余额',
      tags: [DevApiTagsMap.adminTeams],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: UpdateTeamResponseSchema
            }
          }
        }
      }
    }
  }
};
