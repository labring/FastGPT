import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  AdminSystemModelReferenceSchema,
  DeleteAdminSystemModelResponseSchema,
  GetAdminSystemModelDetailResponseSchema,
  GetAdminSystemModelDefaultConfigResponseSchema,
  GetAdminSystemModelListResponseSchema,
  TestAdminSystemModelQuerySchema,
  TestAdminSystemModelResponseSchema,
  UpdateSystemModelBodySchema,
  UpdateSystemModelResponseSchema,
  UpdateSystemModelsWithJsonBodySchema,
  UpdateSystemModelsWithJsonResponseSchema
} from './api';

export const AdminSystemModelPath: OpenAPIPath = {
  '/core/ai/model/list': {
    get: {
      summary: '获取管理员模型列表',
      tags: [DevApiTagsMap.adminSettings],
      responses: {
        200: {
          description: '模型列表',
          content: { 'application/json': { schema: GetAdminSystemModelListResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/detail': {
    get: {
      summary: '获取管理员模型详情',
      tags: [DevApiTagsMap.adminSettings],
      requestParams: { query: AdminSystemModelReferenceSchema },
      responses: {
        200: {
          description: '模型详情',
          content: { 'application/json': { schema: GetAdminSystemModelDetailResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/getDefaultConfig': {
    get: {
      summary: '获取模型默认配置',
      description: '根据 modelId 获取内置模型的插件模板配置',
      tags: [DevApiTagsMap.adminSettings],
      requestParams: { query: AdminSystemModelReferenceSchema },
      responses: {
        200: {
          description: '模型默认配置',
          content: {
            'application/json': { schema: GetAdminSystemModelDefaultConfigResponseSchema }
          }
        }
      }
    }
  },
  '/core/ai/model/delete': {
    delete: {
      summary: '删除自定义模型',
      tags: [DevApiTagsMap.adminSettings],
      requestParams: { query: AdminSystemModelReferenceSchema },
      responses: {
        200: {
          description: '删除成功',
          content: { 'application/json': { schema: DeleteAdminSystemModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/test': {
    get: {
      summary: '测试模型配置',
      tags: [DevApiTagsMap.adminSettings],
      requestParams: { query: TestAdminSystemModelQuerySchema },
      responses: {
        200: {
          description: '模型测试结果',
          content: { 'application/json': { schema: TestAdminSystemModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/update': {
    put: {
      summary: '更新系统模型配置',
      description: '合并并严格校验指定系统模型的配置',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSystemModelBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: UpdateSystemModelResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/model/updateWithJson': {
    put: {
      summary: '导入系统模型配置',
      description: '严格校验 JSON 内容后覆盖系统模型配置',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSystemModelsWithJsonBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '导入成功',
          content: {
            'application/json': {
              schema: UpdateSystemModelsWithJsonResponseSchema
            }
          }
        }
      }
    }
  }
};
