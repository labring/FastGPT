import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  GetSystemInitDataQuerySchema,
  ProSsoConfigQuerySchema,
  ProSsoConfigResponseSchema,
  GetSystemInitDataResponseSchema,
  UnlockSystemTaskQuerySchema,
  UnlockSystemTaskResponseSchema
} from './api';

export const CommonSystemPath: OpenAPIPath = {
  '/proApi/common/system/sso/config': {
    get: {
      summary: '获取 Pro SSO 接入状态（内部接口）',
      description:
        '仅供主服务携带 x-fastgpt-pro-token 直连 Pro /api 路由；浏览器代理不提供内部令牌。默认仅返回 enabled（兼容旧版主服务），传入 includeProvider=true 时按需探测并返回 isWecom。返回值不含 SSO 地址或凭据。',
      tags: [DevApiTagsMap.commonSystem],
      requestParams: {
        query: ProSsoConfigQuerySchema
      },
      responses: {
        200: {
          description: 'Pro 当前 SSO 接入状态',
          content: { 'application/json': { schema: ProSsoConfigResponseSchema } }
        }
      }
    }
  },
  '/common/system/getInitData': {
    get: {
      summary: '获取系统初始化数据',
      description:
        '按会话鉴权返回公开前端配置，SSO 只返回能力标志；includeSubPlans=true 时返回公开套餐，不依赖 Referer 或页面路径；缓存标识包含匿名过滤规则版本',
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
