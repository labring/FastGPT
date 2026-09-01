import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  AdminSystemModelReferenceSchema,
  CreateSystemModelBodySchema,
  CreateSystemModelResponseSchema,
  GetAdminSystemModelDetailResponseSchema,
  GetAdminSystemModelDefaultConfigResponseSchema,
  GetAdminSystemModelListResponseSchema,
  GetSystemModelConfigJsonResponseSchema,
  TestAdminSystemModelQuerySchema,
  TestAdminSystemModelResponseSchema,
  UpdateDefaultModelsBodySchema,
  UpdateSystemModelBodySchema,
  UpdateSystemModelsWithJsonBodySchema
} from './api';

export const AdminSystemModelPath: OpenAPIPath = {
  '/admin/settings/model/list': {
    get: {
      summary: '获取管理员系统模型列表',
      tags: [DevApiTagsMap.adminSettings],
      responses: {
        200: {
          description: '模型列表',
          content: { 'application/json': { schema: GetAdminSystemModelListResponseSchema } }
        }
      }
    }
  },
  '/admin/settings/model/detail': {
    get: {
      summary: '获取管理员系统模型详情',
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
  '/admin/settings/model/getDefaultConfig': {
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
  '/admin/settings/model/create': {
    post: {
      summary: '创建自定义系统模型',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: { 'application/json': { schema: CreateSystemModelBodySchema } }
      },
      responses: {
        200: {
          description: '创建成功',
          content: { 'application/json': { schema: CreateSystemModelResponseSchema } }
        }
      }
    }
  },
  '/admin/settings/model/delete': {
    delete: {
      summary: '删除自定义系统模型',
      tags: [DevApiTagsMap.adminSettings],
      requestParams: { query: AdminSystemModelReferenceSchema },
      responses: { 200: { description: '删除成功' } }
    }
  },
  '/admin/settings/model/test': {
    get: {
      summary: '测试系统模型配置',
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
  '/admin/settings/model/update': {
    put: {
      summary: '更新系统模型配置',
      description: '只按 modelId 更新已有系统模型',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: { 'application/json': { schema: UpdateSystemModelBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/admin/settings/model/getConfigJson': {
    get: {
      summary: '导出系统模型配置',
      tags: [DevApiTagsMap.adminSettings],
      responses: {
        200: {
          description: '系统模型配置 JSON',
          content: { 'application/json': { schema: GetSystemModelConfigJsonResponseSchema } }
        }
      }
    }
  },
  '/admin/settings/model/updateWithJson': {
    put: {
      summary: '导入系统模型配置',
      description: '忽略无 modelId 的旧记录，按 ID 更新或按 model 创建外部实例记录',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: { 'application/json': { schema: UpdateSystemModelsWithJsonBodySchema } }
      },
      responses: { 200: { description: '导入成功' } }
    }
  },
  '/admin/settings/model/updateDefault': {
    put: {
      summary: '更新系统默认模型',
      description: '按 string modelId 更新各模型类型及系统用途的默认模型',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: { 'application/json': { schema: UpdateDefaultModelsBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  }
};
