import type { OpenAPIPath } from '../../../../type';
import z from 'zod';
import {
  PlaygroundConfigQuerySchema,
  PlaygroundConfigResponseSchema,
  PlaygroundUpdateBodySchema,
  PlaygroundUpdateResponseSchema
} from './api';
import { TagsMap } from '../../../../tag';

const InvalidParamsResponseSchema = z
  .object({
    code: z.literal(500).meta({
      description: '错误码'
    }),
    statusText: z.literal('Invalid Params').meta({
      description: '错误状态'
    }),
    message: z.string().meta({
      description: '参数校验失败说明'
    }),
    data: z.null().meta({
      description: '错误响应无业务数据'
    })
  })
  .meta({
    description: '请求参数错误'
  });

const UnauthorizedResponseSchema = z
  .object({
    code: z.literal(401).meta({
      description: '错误码'
    }),
    statusText: z.literal('unAuthorization').meta({
      description: '错误状态'
    }),
    message: z.string().meta({
      description: '未授权错误说明'
    }),
    data: z.null().meta({
      description: '错误响应无业务数据'
    })
  })
  .meta({
    description: '用户未授权'
  });

export const PlaygroundPath: OpenAPIPath = {
  '/support/outLink/playground/config': {
    get: {
      summary: '获取门户配置',
      description:
        '获取指定应用的门户聊天界面的可见性配置，包括节点状态、响应详情、全文显示和原始来源显示的设置',
      tags: [TagsMap.publishChannel],
      requestParams: {
        query: PlaygroundConfigQuerySchema
      },
      responses: {
        200: {
          description: '成功返回门户配置',
          content: {
            'application/json': {
              schema: PlaygroundConfigResponseSchema
            }
          }
        },
        400: {
          description: '请求参数错误',
          content: {
            'application/json': {
              schema: InvalidParamsResponseSchema
            }
          }
        },
        401: {
          description: '用户未授权',
          content: {
            'application/json': {
              schema: UnauthorizedResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/outLink/playground/update': {
    put: {
      summary: '更新门户配置',
      description:
        '更新指定应用的门户聊天界面的可见性配置，包括节点状态、响应详情、全文显示和原始来源显示的设置。如果配置不存在则创建新配置',
      tags: [TagsMap.publishChannel],
      requestBody: {
        content: {
          'application/json': {
            schema: PlaygroundUpdateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新门户配置',
          content: {
            'application/json': {
              schema: PlaygroundUpdateResponseSchema
            }
          }
        },
        400: {
          description: '请求参数错误',
          content: {
            'application/json': {
              schema: InvalidParamsResponseSchema
            }
          }
        },
        401: {
          description: '用户未授权',
          content: {
            'application/json': {
              schema: UnauthorizedResponseSchema
            }
          }
        }
      }
    }
  }
};
