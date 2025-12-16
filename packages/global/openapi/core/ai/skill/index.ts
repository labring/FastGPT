import type { OpenAPIPath } from '../../../type';
import {
  ListAiSkillBody,
  GetAiSkillDetailQuery,
  UpdateAiSkillBody,
  DeleteAiSkillQuery
} from './api';
import { TagsMap } from '../../../tag';
import { z } from 'zod';

export const AISkillPath: OpenAPIPath = {
  '/core/ai/skill/list': {
    post: {
      summary: '获取AI技能列表',
      description: '获取指定应用的AI技能列表，支持分页和搜索',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: ListAiSkillBody
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
      description: '根据技能ID获取详细信息，会自动获取对应的应用权限进行鉴权',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: GetAiSkillDetailQuery
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
        '使用 upsert 方式更新或创建AI技能。如果提供 id 则更新现有技能（会自动获取 appId 进行鉴权），如果不提供 id 则创建新技能（需提供 appId）',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateAiSkillBody
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
      description: '根据技能ID删除AI技能，会自动获取对应的应用权限进行鉴权',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: DeleteAiSkillQuery
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
