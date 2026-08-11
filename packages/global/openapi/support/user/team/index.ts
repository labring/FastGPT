import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetTeamPlanStatusQuerySchema,
  GetTeamPlanStatusResponseSchema,
  UpdateTeamBodySchema
} from './api';
import { EnterpriseAuthPath } from './enterpriseAuth';
import { TeamLimitPath } from './limit';

export const TeamPath: OpenAPIPath = {
  ...EnterpriseAuthPath,
  ...TeamLimitPath,
  '/support/user/team/update': {
    put: {
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
  },
  '/support/user/team/plan/getTeamPlanStatus': {
    get: {
      summary: '获取团队套餐状态',
      description: '获取当前团队的套餐额度及成员、应用、知识库等资源用量',
      tags: [DevApiTagsMap.teamManage],
      requestParams: {
        query: GetTeamPlanStatusQuerySchema
      },
      responses: {
        200: {
          description: '成功返回团队套餐状态',
          content: {
            'application/json': {
              schema: GetTeamPlanStatusResponseSchema
            }
          }
        }
      }
    }
  }
};
