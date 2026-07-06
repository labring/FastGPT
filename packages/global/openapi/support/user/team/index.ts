import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { UpdateTeamBodySchema } from './api';
import { EnterpriseAuthPath } from './enterpriseAuth';

export const TeamPath: OpenAPIPath = {
  ...EnterpriseAuthPath,
  '/api/support/user/team/update': {
    post: {
      summary: '更新团队信息',
      description: '更新团队名称、头像、域名、第三方账号（OpenAI）及外部工作流变量',
      tags: [DevApiTagsMap.teamManage],
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
