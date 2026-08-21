import z from 'zod';
import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { SaveTemplateTypeBodySchema, UpdateTemplateTypeOrderBodySchema } from './api';

export const AdminTemplateTypePath: OpenAPIPath = {
  '/admin/core/app/templateType/save': {
    post: {
      summary: '保存模板类型',
      description: '管理员创建或更新模板类型',
      tags: [DevApiTagsMap.adminTemplateType],
      requestBody: {
        content: {
          'application/json': {
            schema: SaveTemplateTypeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '保存成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/core/app/templateType/delete': {
    delete: {
      summary: '删除模板类型',
      description: '根据类型ID删除模板类型及其关联的模板',
      tags: [DevApiTagsMap.adminTemplateType],
      requestParams: {
        query: z.object({
          typeId: z.string().meta({ description: '模板类型ID' })
        })
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/core/app/templateType/updateOrder': {
    post: {
      summary: '更新模板类型排序',
      description: '批量更新模板类型的排序',
      tags: [DevApiTagsMap.adminTemplateType],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTemplateTypeOrderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '排序更新成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  }
};
