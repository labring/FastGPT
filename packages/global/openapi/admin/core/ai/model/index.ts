import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  AdminSystemModelReferenceSchema,
  CreateSystemModelBodySchema,
  CreateSystemModelResponseSchema,
  CreateSystemModelsFromTemplatesBodySchema,
  CreateSystemModelsFromTemplatesResponseSchema,
  DeleteSystemModelsBodySchema,
  GetAdminModelTemplatesResponseSchema,
  GetAdminSystemModelDetailResponseSchema,
  GetAdminSystemModelListResponseSchema,
  GetSystemModelConfigJsonResponseSchema,
  ReplaceSystemModelChannelsBodySchema,
  TestAdminSystemModelQuerySchema,
  TestDraftAdminSystemModelBodySchema,
  TestAdminSystemModelResponseSchema,
  UpdateDefaultModelsBodySchema,
  UpdateSystemModelBodySchema,
  UpdateSystemModelStatusBodySchema,
  UpdateSystemModelsWithJsonBodySchema
} from './api';

export const AdminSystemModelPath: OpenAPIPath = {
  '/admin/settings/model/list': {
    get: {
      summary: '获取管理员系统模型列表',
      tags: [DevApiTagsMap.adminSystemModel],
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
      tags: [DevApiTagsMap.adminSystemModel],
      requestParams: { query: AdminSystemModelReferenceSchema },
      responses: {
        200: {
          description: '完整模型参数、全部渠道展示信息及当前关联状态',
          content: { 'application/json': { schema: GetAdminSystemModelDetailResponseSchema } }
        }
      }
    }
  },
  '/admin/settings/model/create': {
    post: {
      summary: '创建自定义系统模型',
      tags: [DevApiTagsMap.adminSystemModel],
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
  '/admin/settings/model/templates': {
    get: {
      summary: '实时获取 Plugin 模型模板',
      tags: [DevApiTagsMap.adminSystemModel],
      responses: {
        200: {
          description: '模型模板列表',
          content: { 'application/json': { schema: GetAdminModelTemplatesResponseSchema } }
        }
      }
    }
  },
  '/admin/settings/model/createFromTemplates': {
    post: {
      summary: '从模板批量创建系统模型',
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: CreateSystemModelsFromTemplatesBodySchema } }
      },
      responses: {
        200: {
          description: '实际创建的模型列表',
          content: {
            'application/json': { schema: CreateSystemModelsFromTemplatesResponseSchema }
          }
        }
      }
    }
  },
  '/admin/settings/model/channel/replace': {
    put: {
      summary: '替换模型渠道绑定',
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: ReplaceSystemModelChannelsBodySchema } }
      },
      responses: { 200: { description: '替换成功' } }
    }
  },
  '/admin/settings/model/delete': {
    delete: {
      summary: '批量删除系统模型',
      description: '按 modelIds 批量删除系统模型；服务端仍兼容旧版 modelId query',
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: DeleteSystemModelsBodySchema } }
      },
      responses: { 200: { description: '删除成功' } }
    }
  },
  '/admin/settings/model/test': {
    get: {
      summary: '测试系统模型配置',
      tags: [DevApiTagsMap.adminSystemModel],
      requestParams: { query: TestAdminSystemModelQuerySchema },
      responses: {
        200: {
          description: '模型测试结果',
          content: { 'application/json': { schema: TestAdminSystemModelResponseSchema } }
        }
      }
    },
    post: {
      summary: '测试尚未创建的系统模型配置',
      description: '使用当前表单草稿和指定渠道发起测试，不持久化模型',
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: TestDraftAdminSystemModelBodySchema } }
      },
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
      description: '只按 modelId 更新已有系统模型的可编辑参数，模型标识不可修改',
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: UpdateSystemModelBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/admin/settings/model/updateStatus': {
    put: {
      summary: '批量更新系统模型启停状态',
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: UpdateSystemModelStatusBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/admin/settings/model/getConfigJson': {
    get: {
      summary: '导出系统模型配置',
      tags: [DevApiTagsMap.adminSystemModel],
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
      description:
        '忽略无 modelId 的旧记录；本实例 modelId 命中时保留原模型标识并只更新可编辑参数，外部 modelId 按 model 创建或更新',
      tags: [DevApiTagsMap.adminSystemModel],
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
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: UpdateDefaultModelsBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  }
};
