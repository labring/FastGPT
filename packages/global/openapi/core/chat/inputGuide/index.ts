import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { ChatInputGuideListBodySchema, ChatInputGuideListResponseSchema } from './api';

export const ChatInputGuidePath: OpenAPIPath = {
  '/core/chat/inputGuide/list': {
    post: {
      summary: '获取对话输入引导列表',
      description: '获取指定应用的对话输入引导列表，支持关键词模糊搜索和分页',
      tags: [TagsMap.chatInputGuide],
      requestBody: {
        content: {
          'application/json': {
            schema: ChatInputGuideListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回输入引导列表',
          content: {
            'application/json': {
              schema: ChatInputGuideListResponseSchema
            }
          }
        }
      }
    }
  }
};
