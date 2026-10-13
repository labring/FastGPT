import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import {
  StopV2ChatRawSchema,
  StopV2ChatResponseSchema,
  InitChatQueryRawSchema,
  InitChatResponseSchema
} from './api';

export const ChatControllerPath: OpenAPIPath = {
  '/core/chat/init': {
    get: {
      summary: '获取会话框基本信息',
      description: '',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
      requestParams: {
        query: InitChatQueryRawSchema
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
      summary: '停止会话',
      description: `为正在运行的会话写入停止标记并立即返回。客户端收到成功响应后应中断当前流式请求。
  工作流会在后续安全检查点停止调度；HTTP 请求等无法主动中断的当前节点仍需等待其自行结束。`,
      tags: [DevApiTagsMap.chatController, SystemOpenApiTagMap.chatController],
      requestBody: {
        content: {
          'application/json': {
            schema: StopV2ChatRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功写入工作流停止标记',
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
