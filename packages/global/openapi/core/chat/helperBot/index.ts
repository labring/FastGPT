import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  HelperBotCompletionsParamsSchema,
  DeleteHelperBotChatParamsSchema,
  GetHelperBotChatRecordsParamsSchema,
  GetHelperBotChatRecordsResponseSchema
} from './api';

export const HelperBotPath: OpenAPIPath = {
  '/proApi/core/chat/helperBot/completions': {
    post: {
      summary: '辅助生成统一对话接口',
      description: '辅助生成统一对话接口',
      tags: [TagsMap.helperBot],
      requestBody: {
        content: {
          'application/json': {
            schema: HelperBotCompletionsParamsSchema
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
  },
  '/core/chat/helperBot/getRecords': {
    get: {
      summary: '分页获取记录',
      description: '分页获取记录',
      tags: [TagsMap.helperBot],
      requestParams: {
        query: GetHelperBotChatRecordsParamsSchema
      },
      responses: {
        200: {
          description: '成功返回记录列表',
          content: {
            'application/json': {
              schema: GetHelperBotChatRecordsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/helperBot/deleteRecord': {
    delete: {
      summary: '删除单组对话',
      description: '删除单组对话',
      tags: [TagsMap.helperBot],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteHelperBotChatParamsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除记录',
          content: {
            'application/json': {
              schema: z.any()
            }
          }
        }
      }
    }
  }
};
