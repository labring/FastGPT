import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  CreateModelBodySchema,
  CreateModelResponseSchema,
  DeleteModelQuerySchema,
  DeleteModelResponseSchema,
  GetConfigJsonResponseSchema,
  GetModelDetailQuerySchema,
  GetModelDetailResponseSchema,
  GetModelTemplatesQuerySchema,
  GetModelTemplatesResponseSchema,
  GetSystemDefaultModelResponseSchema,
  ListModelsBodySchema,
  ListModelsResponseSchema,
  TestModelQuerySchema,
  TestModelResponseSchema,
  UpdateModelBodySchema,
  UpdateModelResponseSchema,
  UpdateSystemDefaultModelBodySchema,
  UpdateSystemDefaultModelResponseSchema,
  UpdateWithJsonBodySchema,
  UpdateWithJsonResponseSchema,
  UsageLogBodySchema,
  UsageLogResponseSchema,
  UsageStatsBodySchema
} from './api';

export const ModelPath: OpenAPIPath = {
  '/core/ai/model/list': {
    post: {
      summary: '分页获取模型列表',
      description: '获取当前用户可访问的模型列表（自己创建的 + 系统模型 + 团队授权）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: ListModelsBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回模型列表',
          content: { 'application/json': { schema: ListModelsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/detail': {
    get: {
      summary: '获取模型详情',
      description: '根据 modelId 获取模型详细信息',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetModelDetailQuerySchema },
      responses: {
        200: {
          description: '成功返回模型详情',
          content: { 'application/json': { schema: GetModelDetailResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/create': {
    post: {
      summary: '创建模型',
      description: '创建自定义模型，返回新创建的模型 ID',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: CreateModelBodySchema } }
      },
      responses: {
        200: {
          description: '成功创建模型',
          content: { 'application/json': { schema: CreateModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/update': {
    put: {
      summary: '更新模型配置',
      description: '更新模型配置元数据，支持部分更新',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateModelBodySchema } }
      },
      responses: {
        200: {
          description: '成功更新模型',
          content: { 'application/json': { schema: UpdateModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/delete': {
    delete: {
      summary: '删除模型',
      description: '删除指定的自定义模型（系统模型需 root）',
      tags: [DevApiTagsMap.model],
      requestParams: { query: DeleteModelQuerySchema },
      responses: {
        200: {
          description: '成功删除模型',
          content: { 'application/json': { schema: DeleteModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/test': {
    get: {
      summary: '测试模型连通性',
      description: '根据模型类型执行对应的测试请求',
      tags: [DevApiTagsMap.model],
      requestParams: { query: TestModelQuerySchema },
      responses: {
        200: {
          description: '测试成功',
          content: { 'application/json': { schema: TestModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/templates': {
    get: {
      summary: '获取可用模型模板',
      description: '返回 plugin 提供的模型配置模板，供前端创建模型时填充表单',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetModelTemplatesQuerySchema },
      responses: {
        200: {
          description: '成功返回模板列表',
          content: { 'application/json': { schema: GetModelTemplatesResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/updateSystemDefault': {
    put: {
      summary: '配置系统级默认模型',
      description: 'root 配置全平台系统级默认模型（仅 root）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateSystemDefaultModelBodySchema } }
      },
      responses: {
        200: {
          description: '成功更新系统默认模型',
          content: { 'application/json': { schema: UpdateSystemDefaultModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/getSystemDefault': {
    get: {
      summary: '获取系统级默认模型配置',
      description: '返回各场景的系统默认模型 ID 及名称，前端创建资源时用于填充默认模型',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: '成功返回系统默认模型配置',
          content: { 'application/json': { schema: GetSystemDefaultModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/updateWithJson': {
    put: {
      summary: 'JSON 批量导入模型',
      description: '通过 JSON 配置批量导入/更新模型（仅 root）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateWithJsonBodySchema } }
      },
      responses: {
        200: {
          description: '成功批量更新',
          content: { 'application/json': { schema: UpdateWithJsonResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/getConfigJson': {
    get: {
      summary: '导出所有模型配置为 JSON',
      description: '导出所有模型配置为 JSON 字符串（仅 root）',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: '成功导出',
          content: { 'application/json': { schema: GetConfigJsonResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/usageLogs': {
    post: {
      summary: '模型调用日志',
      description: '分页获取当前用户可访问模型的调用日志（usage_items，模型维度，AUTH-TC08）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UsageLogBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回调用日志',
          content: { 'application/json': { schema: UsageLogResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/usageStats': {
    post: {
      summary: '模型监控聚合',
      description:
        '聚合当前用户可访问模型的监控数据（调用次数/Token/积分/趋势/模型分布，AUTH-TC08）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UsageStatsBodySchema } }
      },
      responses: {
        200: { description: '成功返回监控聚合数据' }
      }
    }
  }
};
