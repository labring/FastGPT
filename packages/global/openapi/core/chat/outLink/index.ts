import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { InitOutLinkChatQuerySchema, InitOutLinkChatResponseSchema } from './api';

export const OutLinkChatPath: OpenAPIPath = {
  '/core/chat/outLink/init': {
    get: {
      summary: '初始化外链会话',
      description: [
        '通过分享链接初始化外链会话，返回应用配置、变量和已有会话状态。',
        'Query 必须传 outLinkAuthData，包含 shareId 与 outLinkUid，并使用 JSON 字符串序列化；chatId 可选。应用身份由分享链接解析，无需传 appId 或 skillId。',
        '按外链发布配置鉴权，受保护外链仍需登录态；应用会话与 Skill 调试会话请使用 GET /api/core/chat/init。'
      ].join('\n\n'),
      tags: [DevApiTagsMap.chatHistory],
      requestParams: {
        query: InitOutLinkChatQuerySchema
      },
      responses: {
        200: {
          description: '成功返回会话初始化信息',
          content: {
            'application/json': {
              schema: InitOutLinkChatResponseSchema
            }
          }
        }
      }
    }
  }
};
