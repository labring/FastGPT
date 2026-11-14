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
      description:
        '支持两种请求模式：登录态客户端事件由 authCert 校验；外链品牌事件必须传 authType=outLink，并按外链身份、品牌展示状态和公开接口限流校验。拒绝未声明的数据字段；辅助生成入口点击按小时全局聚合，不接受服务端链路事件',
      tags: [DevApiTagsMap.commonOther, DevApiTagsMap.chatHistory],
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
        },
        429: {
          description: '外链品牌事件请求超限或限流服务不可用'
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
