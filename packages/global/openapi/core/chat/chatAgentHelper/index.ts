import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { ChatAgentHelperCompletionsParamsSchema, ChatAgentHelperSseResponseSchema } from './api';
import { ChatAgentConfigLoadBodySchema, ChatAgentConfigLoadResponseSchema } from './config';

export const ChatAgentHelperPath: OpenAPIPath = {
  '/proApi/core/chat/chatAgentHelper/config/load': {
    post: {
      summary: '加载 Chat Agent 辅助生成配置',
      description: '加载聊天消息归档的配置，供用户重新应用',
      tags: [DevApiTagsMap.aiAuxiliary],
      requestBody: {
        content: { 'application/json': { schema: ChatAgentConfigLoadBodySchema } }
      },
      responses: {
        200: {
          description: '成功加载生成配置',
          content: { 'application/json': { schema: ChatAgentConfigLoadResponseSchema } }
        }
      }
    }
  },
  '/proApi/core/chat/chatAgentHelper/completions': {
    post: {
      summary: 'Chat Agent 辅助生成',
      description: 'Chat Agent 辅助生成对话接口',
      tags: [DevApiTagsMap.aiAuxiliary],
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
            'text/event-stream': {
              schema: ChatAgentHelperSseResponseSchema
            }
          }
        }
      }
    }
  }
};
