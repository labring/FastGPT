import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { HelperBotCompletionsParamsSchema } from './api';

export const HelperBotPath: OpenAPIPath = {
  '/proApi/core/chat/helperBot/completions': {
    post: {
      summary: '辅助生成统一对话接口',
      description: '辅助生成统一对话接口',
      tags: [DevApiTagsMap.helperBot],
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
  }
};
