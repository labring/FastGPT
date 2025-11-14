import { z } from 'zod';
import type { OpenAPIPath } from '../../../type';
import { ChatFavouriteAppSchema } from '../../../../core/chat/favouriteApp/type';
import {
  GetChatFavouriteListParamsSchema,
  UpdateFavouriteAppParamsSchema,
  UpdateFavouriteAppTagsParamsSchema
} from './api';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { TagsMap } from '../../../tag';

export const ChatFavouriteAppPath: OpenAPIPath = {
  '/proApi/core/chat/setting/favourite/list': {
    get: {
      summary: '获取精选应用列表',
      description: '获取团队配置的精选应用列表，支持按名称和标签筛选',
      tags: [TagsMap.chatSetting],
      requestParams: {
        query: GetChatFavouriteListParamsSchema
      },
      responses: {
        200: {
          description: '成功返回精选应用列表',
          content: {
            'application/json': {
              schema: z.array(ChatFavouriteAppSchema)
            }
          }
        }
      }
    }
  },
  '/proApi/core/chat/setting/favourite/update': {
    post: {
      summary: '更新精选应用',
      description: '批量创建或更新精选应用配置，包括应用 ID、标签和排序信息',
      tags: [TagsMap.chatSetting],
      requestBody: {
        content: {
          'application/json': {
            schema: z.array(UpdateFavouriteAppParamsSchema)
          }
        }
      },
      responses: {
        200: {
          description: '成功更新精选应用',
          content: {
            'application/json': {
              schema: z.array(ChatFavouriteAppSchema)
            }
          }
        }
      }
    }
  },
  '/proApi/core/chat/setting/favourite/order': {
    put: {
      summary: '更新精选应用排序',
      description: '批量更新精选应用的显示顺序',
      tags: [TagsMap.chatSetting],
      requestBody: {
        content: {
          'application/json': {
            schema: z.array(
              z.object({
                id: ObjectIdSchema.meta({
                  example: '68ad85a7463006c963799a05',
                  description: '精选应用 ID'
                }),
                order: z.number().meta({ example: 1, description: '排序' })
              })
            )
          }
        }
      },
      responses: {
        200: {
          description: '成功更新精选应用排序',
          content: {
            'application/json': {
              schema: z.null()
            }
          }
        }
      }
    }
  },
  '/proApi/core/chat/setting/favourite/tags': {
    put: {
      summary: '更新精选应用标签',
      description: '批量更新精选应用的标签分类',
      tags: [TagsMap.chatSetting],
      requestBody: {
        content: {
          'application/json': {
            schema: z.array(UpdateFavouriteAppTagsParamsSchema)
          }
        }
      },
      responses: {
        200: {
          description: '成功更新精选应用标签',
          content: {
            'application/json': {
              schema: z.null()
            }
          }
        }
      }
    }
  },
  '/proApi/core/chat/setting/favourite/delete': {
    delete: {
      summary: '删除精选应用',
      description: '根据 ID 删除指定的精选应用配置',
      tags: [TagsMap.chatSetting],
      requestParams: {
        query: z.object({
          id: ObjectIdSchema
        })
      },
      responses: {
        200: {
          description: '成功删除精选应用',
          content: {
            'application/json': {
              schema: z.null()
            }
          }
        }
      }
    }
  }
};
