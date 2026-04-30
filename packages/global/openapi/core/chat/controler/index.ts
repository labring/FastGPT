import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  StopV2ChatSchema,
  StopV2ChatResponseSchema,
  InitChatQuerySchema,
  InitChatResponseSchema
} from './api';

export const ChatControllerPath: OpenAPIPath = {
  '/core/chat/init': {
    get: {
      summary: '初始化聊天',
      description: '初始化聊天',
      tags: [TagsMap.chatController],
      requestParams: {
        query: InitChatQuerySchema
      },
      responses: {
        200: {
          description: '成功返回聊天初始化信息',
          content: {
            'application/json': {
              schema: InitChatResponseSchema
            }
          }
        }
      }
    }
  },
  '/v2/chat/stop': {
    post: {
      summary: '停止 Agent 运行',
      description: `优雅停止正在运行的 Agent, 会尝试等待当前节点结束后返回，最长 5s，超过 5s 仍未结束，则会返回成功。
  LLM 节点，流输出时会同时被终止，但 HTTP 请求节点这种可能长时间运行的，不会被终止。`,
      tags: [TagsMap.chatController],
      requestBody: {
        content: {
          'application/json': {
            schema: StopV2ChatSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功停止工作流',
          content: {
            'application/json': {
              schema: StopV2ChatResponseSchema
            }
          }
        }
      }
    }
  }
};
