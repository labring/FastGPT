import type { OpenAPIPath } from '../../../type';
import {
  DeleteFavouriteAppQuerySchema,
  GetChatFavouriteListParamsSchema,
  GetChatFavouriteListResponseSchema,
  ReorderFavouriteAppsBodySchema,
  UpdateFavouriteAppsBodySchema,
  UpdateFavouriteAppTagsBodySchema
} from './api';
import { DevApiTagsMap } from '../../../tag';

export const ChatFavouriteAppPath: OpenAPIPath = {
  '/proApi/core/chat/setting/favourite/list': {
    get: {
      summary: '获取精选应用列表',
      description: '获取团队配置的精选应用列表，支持按名称和标签筛选',
      tags: [DevApiTagsMap.chatSetting],
      requestParams: {
        query: GetChatFavouriteListParamsSchema
      },
      responses: {
        200: {
          description: '成功返回精选应用列表',
          content: {
            'application/json': {
              schema: GetChatFavouriteListResponseSchema
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
      tags: [DevApiTagsMap.chatSetting],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateFavouriteAppsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新精选应用'
        }
      }
    }
  },
  '/proApi/core/chat/setting/favourite/order': {
    put: {
      summary: '更新精选应用排序',
      description: '批量更新精选应用的显示顺序',
      tags: [DevApiTagsMap.chatSetting],
      requestBody: {
        content: {
          'application/json': {
            schema: ReorderFavouriteAppsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新精选应用排序'
        }
      }
    }
  },
  '/proApi/core/chat/setting/favourite/tags': {
    put: {
      summary: '更新精选应用标签',
      description: '批量更新精选应用的标签分类',
      tags: [DevApiTagsMap.chatSetting],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateFavouriteAppTagsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新精选应用标签'
        }
      }
    }
  },
  '/proApi/core/chat/setting/favourite/delete': {
    delete: {
      summary: '删除精选应用',
      description: '根据 ID 删除指定的精选应用配置',
      tags: [DevApiTagsMap.chatSetting],
      requestParams: {
        query: DeleteFavouriteAppQuerySchema
      },
      responses: {
        200: {
          description: '成功删除精选应用'
        }
      }
    }
  }
};
