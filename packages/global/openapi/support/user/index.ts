import { UserInformPath } from './inform';
import type { OpenAPIPath } from '../../type';
import { UserAccountPath } from './account';
import { TeamPath } from './team';
import { UserAuditPath } from './audit';
import {
  SearchUserQuerySchema,
  SearchUserResponseSchema,
  UserSyncBodySchema,
  UserSyncResponseSchema
} from './api';
import { DevApiTagsMap } from '../../tag';

export const UserPath: OpenAPIPath = {
  ...UserAuditPath,
  ...UserInformPath,
  ...UserAccountPath,
  ...TeamPath,
  '/proApi/support/user/search': {
    get: {
      summary: '搜索团队成员、组织和用户组',
      description: '在当前团队中按关键词搜索成员、组织和用户组',
      tags: [DevApiTagsMap.teamManage],
      requestParams: {
        query: SearchUserQuerySchema
      },
      responses: {
        200: {
          description: '成功返回搜索结果',
          content: {
            'application/json': {
              schema: SearchUserResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/sync': {
    post: {
      summary: '同步用户和组织',
      description: '从外部用户系统同步当前团队的用户和组织数据',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UserSyncBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '用户和组织同步成功',
          content: {
            'application/json': {
              schema: UserSyncResponseSchema
            }
          }
        }
      }
    }
  }
};
