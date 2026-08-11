import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import { CheckThirdPartyUsageQuerySchema, CheckThirdPartyUsageResponseSchema } from './api';

export const CommonOtherPath: OpenAPIPath = {
  '/support/user/team/thirtdParty/checkUsage': {
    get: {
      summary: '查询第三方工作流用量',
      description: '查询当前团队成员配置的第三方工作流变量对应的总额度和已使用额度',
      tags: [DevApiTagsMap.commonOther],
      requestParams: {
        query: CheckThirdPartyUsageQuerySchema
      },
      responses: {
        200: {
          description: '成功返回第三方工作流用量',
          content: {
            'application/json': {
              schema: CheckThirdPartyUsageResponseSchema
            }
          }
        }
      }
    }
  }
};
