import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import {
  OutLinkCreateBodySchema,
  OutLinkCreateResponseSchema,
  OutLinkDeleteQuerySchema,
  OutLinkDeleteResponseSchema,
  OutLinkListQuerySchema,
  OutLinkListResponseSchema,
  OutLinkUpdateBodySchema,
  OutLinkUpdateResponseSchema
} from './api';

export const OutLinkPath: OpenAPIPath = {
  '/support/outLink/list': {
    get: {
      summary: '获取应用的发布渠道列表',
      description: '查询指定应用的所有 OutLink 发布渠道配置',
      tags: [TagsMap.publishChannel],
      requestParams: {
        query: OutLinkListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回发布渠道列表',
          content: {
            'application/json': {
              schema: OutLinkListResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/outLink/create': {
    post: {
      summary: '创建发布渠道',
      description: '为指定应用创建发布渠道',
      tags: [TagsMap.publishChannel],
      requestBody: {
        content: {
          'application/json': {
            schema: OutLinkCreateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建发布渠道',
          content: {
            'application/json': {
              schema: OutLinkCreateResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/outLink/update': {
    put: {
      summary: '更新发布渠道',
      description: '更新发布渠道配置',
      tags: [TagsMap.publishChannel],
      requestBody: {
        content: {
          'application/json': {
            schema: OutLinkUpdateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新发布渠道',
          content: {
            'application/json': {
              schema: OutLinkUpdateResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/outLink/delete': {
    delete: {
      summary: '删除发布渠道',
      description: '删除指定发布渠道',
      tags: [TagsMap.publishChannel],
      requestParams: {
        query: OutLinkDeleteQuerySchema
      },
      responses: {
        200: {
          description: '成功删除发布渠道',
          content: {
            'application/json': {
              schema: OutLinkDeleteResponseSchema
            }
          }
        }
      }
    }
  }
};
