import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { UpdateTeamBodySchema } from './api';

export const TeamPath: OpenAPIPath = {
  '/api/support/user/team/update': {
    post: {
      summary: '更新团队信息',
      description: '更新团队名称、头像、域名、第三方账号（Laf/OpenAI）及外部工作流变量',
      tags: [TagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功'
        }
      }
    }
  }
};
