import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { CreateQuestionGuideBodySchema, CreateQuestionGuideResponseSchema } from './api';

export const AgentPath: OpenAPIPath = {
  '/core/ai/agent/createQuestionGuide': {
    post: {
      summary: '创建问题引导',
      description: '根据对话历史生成推荐的引导问题列表',
      tags: [TagsMap.aiCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateQuestionGuideBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回推荐的引导问题列表',
          content: {
            'application/json': {
              schema: CreateQuestionGuideResponseSchema
            }
          }
        }
      }
    }
  }
};
