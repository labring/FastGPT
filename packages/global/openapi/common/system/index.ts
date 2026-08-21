import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  GetSystemInitDataQuerySchema,
  GetSystemInitDataResponseSchema,
  UnlockSystemTaskQuerySchema,
  UnlockSystemTaskResponseSchema
} from './api';

export const CommonSystemPath: OpenAPIPath = {
  '/common/system/getInitData': {
    get: {
      summary: '获取系统初始化数据',
      description: '根据登录状态和缓存标识返回前端初始化配置、模型和套餐信息',
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
