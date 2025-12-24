import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  StopV2ChatSchema,
  StopV2ChatResponseSchema,
  PresignChatFilePostUrlSchema,
  PresignChatFileGetUrlSchema
} from './api';
import { CreatePostPresignedUrlResultSchema } from '../../../../../service/common/s3/type';
import { z } from 'zod';

export const ChatControllerPath: OpenAPIPath = {
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
  },
  '/core/chat/presignChatFilePostUrl': {
    post: {
      summary: '获取文件上传 URL',
      description: '获取文件上传 URL',
      tags: [TagsMap.chatController],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignChatFilePostUrlSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功上传对话文件预签名 URL',
          content: {
            'application/json': {
              schema: CreatePostPresignedUrlResultSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/presignChatFileGetUrl': {
    post: {
      summary: '获取文件预览地址',
      description: '获取文件预览地址',
      tags: [TagsMap.chatController],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignChatFileGetUrlSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取对话文件预签名 URL',
          content: {
            'application/json': {
              schema: z.string()
            }
          }
        }
      }
    }
  }
};
