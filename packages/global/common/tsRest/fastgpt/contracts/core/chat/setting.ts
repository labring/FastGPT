import z from 'zod';
import {
  ChatSettingResponseSchema,
  ChatSettingSchema
} from '../../../../../../core/chat/setting/type';
import { ChatFavouriteAppResponseItemSchema } from '../../../../../../core/chat/favouriteApp/type';
import { ObjectIdSchema } from '../../../../../type';
import { initContract } from '@ts-rest/core';

const c = initContract();
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
    body: z.array(
      z.object({
        appId: z.string(),
        order: z.number()
      })
    ),
    responses: {
      200: z.void()
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
      200: z.void()
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
      200: z.void()
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
      200: z.void()
    },
    metadata: {
      tags: ['chat']
    },
    description: '更新精选应用标签',
    summary: '更新精选应用标签'
  }
});

export const settingContract = c.router({
  favourite: favouriteContract,

  detail: {
    path: '/proApi/core/chat/setting/detail',
    method: 'GET',
    responses: {
      200: ChatSettingResponseSchema
    },
    metadata: {
      tags: ['chat']
    },
    description: '获取聊天设置',
    summary: '获取聊天设置'
  },
  update: {
    path: '/proApi/core/chat/setting/update',
    method: 'PUT',
    body: ChatSettingSchema.partial(),
    responses: {
      200: z.void()
    },
    metadata: {
      tags: ['chat']
    },
    description: '更新聊天设置',
    summary: '更新聊天设置'
  }
});
