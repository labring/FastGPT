import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  GetSystemInitDataQuerySchema,
  GetSystemInitDataResponseSchema,
  ProHealthResponseSchema,
  ProSsoConfigResponseSchema,
  UnlockSystemTaskQuerySchema,
  UnlockSystemTaskResponseSchema
} from './api';

export const CommonSystemPath: OpenAPIPath = {
  '/proApi/common/system/sso/config': {
    get: {
      summary: '获取 Pro SSO 接入状态（内部接口）',
      description:
        '仅供主服务携带 x-fastgpt-pro-token 直连 Pro /api 路由；浏览器代理不提供内部令牌。返回值不含 SSO 地址或凭据。',
      tags: [DevApiTagsMap.commonSystem],
      responses: {
        200: {
          description: 'Pro 当前 SSO 接入状态',
          content: { 'application/json': { schema: ProSsoConfigResponseSchema } }
        }
      }
    }
  },
  '/proApi/health': {
    post: {
      summary: 'Pro 服务健康检查',
      description:
        'Pro 直连 /api/health 的内部令牌认证分支返回前端能力；App 浏览器代理会移除内部令牌，仅返回健康状态',
      tags: [DevApiTagsMap.commonSystem],
      responses: {
        200: {
          description: '服务健康状态和可选的内部能力投影',
          content: {
            'application/json': {
              schema: ProHealthResponseSchema
            }
          }
        }
      }
    }
  },
  '/common/system/getInitData': {
    get: {
      summary: '获取系统初始化数据',
      description:
        '按会话鉴权返回公开前端配置，SSO 能力来自 Pro 且不返回服务地址；includeSubPlans=true 时返回公开套餐，不依赖 Referer 或页面路径；匿名缓存标识包含 SSO 能力状态',
      tags: [DevApiTagsMap.commonSystem],
      requestParams: {
        query: GetSystemInitDataQuerySchema
      },
      responses: {
        200: {
          description: '成功返回系统初始化数据',
          content: {
            'application/json': {
              schema: GetSystemInitDataResponseSchema
            }
          }
        }
      }
    }
  },
  '/common/system/unlockTask': {
    get: {
      summary: '唤醒训练队列',
      description: '尝试鉴权并唤醒当前实例的知识库训练队列',
      tags: [DevApiTagsMap.commonSystem],
      requestParams: {
        query: UnlockSystemTaskQuerySchema
      },
      responses: {
        200: {
          description: '唤醒请求已处理',
          content: {
            'application/json': {
              schema: UnlockSystemTaskResponseSchema
            }
          }
        }
      }
    }
  }
};
