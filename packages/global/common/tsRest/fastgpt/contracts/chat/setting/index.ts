import {
  ChatSettingResponseSchema,
  ChatSettingSchema
} from '../../../../../../core/chat/setting/type';
import { c } from '../../../../init';
import { favouriteContract } from './favourite';

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
      200: c.type<void>()
    },
    metadata: {
      tags: ['chat']
    },
    description: '更新聊天设置',
    summary: '更新聊天设置'
  }
});
