import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  BatchResourceActionResponseSchema,
  BatchResourceDeleteBodySchema,
  BatchResourceMoveBodySchema
} from '../../../../common/batch/api';

export const SkillBatchPath: OpenAPIPath = {
  '/core/ai/skill/batch/move': {
    post: {
      summary: '批量移动技能',
      description: '批量移动技能或文件夹，具体权限、目录深度和继承权限由技能模块校验',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchResourceMoveBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功移动技能',
          content: {
            'application/json': {
              schema: BatchResourceActionResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/batch/delete': {
    post: {
      summary: '批量删除技能',
      description: '批量删除技能或文件夹，具体子树处理和异步清理由技能模块负责',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchResourceDeleteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除技能',
          content: {
            'application/json': {
              schema: BatchResourceActionResponseSchema
            }
          }
        }
      }
    }
  }
};
