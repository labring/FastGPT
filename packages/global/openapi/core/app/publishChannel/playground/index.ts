import { z } from 'zod';
import type { OpenAPIPath } from '../../../../type';
import {
  GetPlaygroundVisibilityConfigParamsSchema,
  PlaygroundVisibilityConfigResponseSchema,
  UpdatePlaygroundVisibilityConfigParamsSchema
} from './api';
import { TagsMap } from '../../../../tag';

export const PlaygroundPath: OpenAPIPath = {
  '/api/support/outLink/playground/config': {
    get: {
      summary: '获取门户配置',
      description:
        '获取指定应用的门户聊天界面的可见性配置，包括节点状态、响应详情、全文显示和原始来源显示的设置',
      tags: [TagsMap.publishChannel],
      requestParams: {
        query: GetPlaygroundVisibilityConfigParamsSchema
      },
      responses: {
        200: {
          description: '成功返回门户配置',
          content: {
            'application/json': {
              schema: PlaygroundVisibilityConfigResponseSchema
            }
          }
        },
        400: {
          description: '请求参数错误',
          content: {
            'application/json': {
              schema: z.object({
                code: z.literal(500),
                statusText: z.literal('Invalid Params'),
                message: z.string(),
                data: z.null()
              })
            }
          }
        },
        401: {
          description: '用户未授权',
          content: {
            'application/json': {
              schema: z.object({
                code: z.literal(401),
                statusText: z.literal('unAuthorization'),
                message: z.string(),
                data: z.null()
              })
            }
          }
        }
      }
    }
  },
  '/api/support/outLink/playground/update': {
    post: {
      summary: '更新门户配置',
      description:
        '更新指定应用的门户聊天界面的可见性配置，包括节点状态、响应详情、全文显示和原始来源显示的设置。如果配置不存在则创建新配置',
      tags: [TagsMap.publishChannel],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePlaygroundVisibilityConfigParamsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新门户配置',
          content: {
            'application/json': {
              schema: z.null()
            }
          }
        },
        400: {
          description: '请求参数错误',
          content: {
            'application/json': {
              schema: z.object({
                code: z.literal(500),
                statusText: z.literal('Invalid Params'),
                message: z.string(),
                data: z.null()
              })
            }
          }
        },
        401: {
          description: '用户未授权',
          content: {
            'application/json': {
              schema: z.object({
                code: z.literal(401),
                statusText: z.literal('unAuthorization'),
                message: z.string(),
                data: z.null()
              })
            }
          }
        }
      }
    }
  }
};
