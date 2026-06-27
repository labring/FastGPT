import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  CreateQuestionGuideBodySchema,
  CreateQuestionGuideResponseSchema,
  CreateQuestionGuideV2BodyRawSchema
} from './api';

export const AgentPath: OpenAPIPath = {
  '/core/ai/agent/createQuestionGuide': {
    post: {
      summary: '创建问题引导',
      description: '根据对话历史生成推荐的引导问题列表',
      tags: [DevApiTagsMap.aiCommon],
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
  },

  '/core/ai/agent/v2/createQuestionGuide': {
    post: {
      summary: '创建会话问题引导',
      description: '基于指定会话历史生成推荐问题，支持普通 App、外链、团队空间和 Skill Edit 调试',
      tags: [DevApiTagsMap.aiCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateQuestionGuideV2BodyRawSchema
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
