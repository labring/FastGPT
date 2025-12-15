import type { OpenAPIPath } from '../../../type';
import {
  GetGeneratedSkillsParamsSchema,
  GetGeneratedSkillDetailParamsSchema,
  UpdateGeneratedSkillParamsSchema,
  DeleteGeneratedSkillParamsSchema
} from './api';
import { TagsMap } from '../../../tag';
import { z } from 'zod';

export const AISkillPath: OpenAPIPath = {
  '/core/ai/skill/list': {
    post: {
      summary: '获取AI技能列表',
      description: '获取指定应用的AI技能列表，支持分页和搜索',
      tags: [TagsMap.helperBot],
      requestBody: {
        content: {
          'application/json': {
            schema: GetGeneratedSkillsParamsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取技能列表',
          content: {
            'application/json': {
              schema: z.object({
                list: z.array(z.any()),
                total: z.number()
              })
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/detail': {
    get: {
      summary: '获取AI技能详情',
      description: '根据技能ID获取详细信息',
      tags: [TagsMap.helperBot],
      requestParams: {
        query: GetGeneratedSkillDetailParamsSchema
      },
      responses: {
        200: {
          description: '成功获取技能详情',
          content: {
            'application/json': {
              schema: z.any()
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/update': {
    put: {
      summary: '更新或创建AI技能',
      description:
        '使用 upsert 方式更新或创建AI技能。如果提供 id 则更新现有技能，如果不提供 id 则创建新技能（需提供 appId、chatId、chatItemId）',
      tags: [TagsMap.helperBot],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateGeneratedSkillParamsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新或创建技能',
          content: {
            'application/json': {
              schema: z.object({
                success: z.boolean(),
                _id: z.string()
              })
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/delete': {
    delete: {
      summary: '删除AI技能',
      description: '删除指定的AI技能',
      tags: [TagsMap.helperBot],
      requestParams: {
        query: DeleteGeneratedSkillParamsSchema
      },
      responses: {
        200: {
          description: '成功删除技能',
          content: {
            'application/json': {
              schema: z.object({
                success: z.boolean()
              })
            }
          }
        }
      }
    }
  }
};
