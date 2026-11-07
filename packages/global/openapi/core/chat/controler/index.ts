import { createChatTargetQueryParameters } from '../api';
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
      summary: '初始化应用或 Skill 调试会话',
      description: [
        '初始化应用会话或 Skill 编辑调试会话，返回会话配置、变量和已有会话状态。',
        'Query 身份二选一：应用会话传 appId；Skill 调试会话传 skillId，两种模式均需传 chatId。使用登录态或接口允许的 API Key 鉴权；同时传入 appId 和 skillId 时优先使用 skillId。',
        '应用辅助生成会话通过 appId 与 sourceType 指定，sourceType 支持 chatAgentHelper、workflowBuilder；普通应用会话省略 sourceType。',
        '外链分享会话使用 GET /api/core/chat/outLink/init，传入 JSON 序列化的 outLinkAuthData。',
        'Skill 编辑沙盒的启动、恢复或复用使用 POST /api/core/ai/skill/runtime/init，与本接口的会话初始化用途不同。'
      ].join('\n\n'),
      tags: [DevApiTagsMap.chatHistory, DevApiTagsMap.skillDebug, SystemOpenApiTagMap.chatHistory],
      parameters: createChatTargetQueryParameters(InitChatQueryRawSchema),
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
