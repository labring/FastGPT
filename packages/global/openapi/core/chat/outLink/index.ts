import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { InitOutLinkChatQuerySchema } from './api';

export const OutLinkChatPath: OpenAPIPath = {
  '/core/chat/outLink/init': {
    get: {
      summary: '初始化外链会话',
      description: '通过分享链接初始化会话，获取应用配置和历史会话信息',
      tags: [TagsMap.chatPage],
      requestParams: {
        query: InitOutLinkChatQuerySchema
      },
      responses: {
        200: {
          description: '成功返回会话初始化信息'
        }
      }
    }
  }
};
