import { ObjectIdSchema } from '../../../../../../type';
import {
  ChatFavouriteAppResponseItemSchema,
  ChatFavouriteAppUpdateSchema
} from '../../../../../../../core/chat/favouriteApp/type';
import { c } from '../../../../../init';
import { z } from 'zod';

export const favouriteContract = c.router({
  list: {
    path: '/proApi/core/chat/setting/favourite/list',
    method: 'GET',
    query: z.object({
      name: z.string().optional().openapi({ example: 'FastGPT' }),
      tag: z.string().optional().openapi({ example: 'i7Ege2W2' })
    }),
    responses: {
      200: z.array(ChatFavouriteAppResponseItemSchema)
    },
    metadata: {
      tags: ['chat']
    },
    description: '获取精选应用列表',
    summary: '获取精选应用列表'
  },

  update: {
    path: '/proApi/core/chat/setting/favourite/update',
    method: 'PUT',
    body: ChatFavouriteAppUpdateSchema,
    responses: {
      200: c.type<void>()
    },
    metadata: {
      tags: ['chat']
    },
    description: '更新精选应用',
    summary: '更新精选应用'
  },

  delete: {
    path: '/proApi/core/chat/setting/favourite/delete',
    method: 'DELETE',
    query: z.object({
      id: ObjectIdSchema
    }),
    responses: {
      200: c.type<void>()
    },
    metadata: {
      tags: ['chat']
    },
    description: '删除精选应用',
    summary: '删除精选应用'
  },

  order: {
    path: '/proApi/core/chat/setting/favourite/order',
    method: 'PUT',
    body: z.array(
      z.object({
        id: ObjectIdSchema,
        order: z.number()
      })
    ),
    responses: {
      200: c.type<void>()
    },
    metadata: {
      tags: ['chat']
    },
    description: '更新精选应用顺序',
    summary: '更新精选应用顺序'
  },

  tags: {
    path: '/proApi/core/chat/setting/favourite/tags',
    method: 'PUT',
    body: z.array(
      z.object({
        id: z.string(),
        tags: z.array(z.string())
      })
    ),
    responses: {
      200: c.type<void>()
    },
    metadata: {
      tags: ['chat']
    },
    description: '更新精选应用标签',
    summary: '更新精选应用标签'
  }
});
