import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { ChatAgentHelperCompletionsParamsSchema } from './api';

export const ChatAgentHelperPath: OpenAPIPath = {
  '/proApi/core/chat/chatAgentHelper/completions': {
    post: {
      summary: 'Chat Agent 辅助生成对话接口',
      description: 'Chat Agent 辅助生成对话接口',
      tags: [DevApiTagsMap.chatAgentHelper],
      requestBody: {
        content: {
          'application/json': {
            schema: ChatAgentHelperCompletionsParamsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回流式处理结果',
          content: {
            'application/stream+json': {
              schema: z.any()
            }
          }
        }
      }
    }
  }
};
