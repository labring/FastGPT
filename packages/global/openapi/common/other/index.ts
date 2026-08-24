import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  CheckThirdPartyUsageQuerySchema,
  CheckThirdPartyUsageResponseSchema,
  FetchWorkflowBodySchema,
  FetchWorkflowResponseSchema,
  PushTrackBodySchema
} from './api';

export const CommonOtherPath: OpenAPIPath = {
  '/support/marketing/fetchWorkflow': {
    post: {
      summary: '获取远程工作流配置',
      description: '校验目标地址安全性后，从指定公网 URL 获取工作流 JSON 配置',
      tags: [DevApiTagsMap.commonOther],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: FetchWorkflowBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回工作流 JSON 配置',
          content: {
            'application/json': {
              schema: FetchWorkflowResponseSchema
            }
          }
        }
      }
    }
  },
  '/common/tracks/push': {
    post: {
      summary: '上报行为埋点',
      description: '上报当前用户的前端行为事件及关联数据',
      tags: [DevApiTagsMap.commonOther],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: PushTrackBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功接收埋点事件'
        }
      }
    }
  },
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
