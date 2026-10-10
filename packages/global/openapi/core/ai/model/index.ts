import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import type { OpenAPIPath } from '../../../type';
import {
  CreateModelBodySchema,
  CreateModelResponseSchema,
  CreateModelsFromTemplatesBodySchema,
  CreateModelsFromTemplatesResponseSchema,
  DeleteModelsBodySchema,
  GetModelDetailResponseSchema,
  GetModelConfigQuerySchema,
  GetModelConfigResponseSchema,
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  GetModelTemplatesQuerySchema,
  GetModelTemplatesResponseSchema,
  GetSystemModelConfigJsonResponseSchema,
  GetSystemModelsResponseSchema,
  ModelReferenceSchema,
  TestDraftModelBodySchema,
  TestModelQuerySchema,
  UpdateDefaultModelsBodySchema,
  UpdateModelBodySchema,
  UpdateModelChannelsBodySchema,
  UpdateModelStatusBodySchema,
  UpdateSystemModelsWithJsonBodySchema
} from './api';
import { CollaboratorListSchema } from '../../../../support/permission/collaborator.schema';
import {
  ModelCollaboratorBatchListBodySchema,
  ModelCollaboratorBatchListResponseSchema,
  ModelCollaboratorListQuerySchema,
  ModelCollaboratorUpdateBodySchema
} from '../../../../support/permission/model/controller.schema';
import { GetModelSummariesBodySchema, GetModelSummariesResponseSchema } from './summary';
import { ChannelPath } from './channel';

export const AIModelPath: OpenAPIPath = {
  ...ChannelPath,
  '/core/ai/model/create': {
    post: {
      summary: '创建自定义模型',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: CreateModelBodySchema } }
      },
      responses: {
        200: {
          description: '创建成功',
          content: { 'application/json': { schema: CreateModelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/detail': {
    get: {
      summary: '获取模型详情',
      tags: [DevApiTagsMap.model],
      requestParams: { query: ModelReferenceSchema },
      responses: {
        200: {
          description: '完整模型参数、全部渠道展示信息及当前关联状态',
          content: { 'application/json': { schema: GetModelDetailResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/templates': {
    get: {
      summary: '实时获取 Plugin 模型模板',
      description: 'channelType=system 仅 root；channelType=team 需要“安装模型”权限（仅商业版）',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetModelTemplatesQuerySchema },
      responses: {
        200: {
          description: '模型模板列表',
          content: { 'application/json': { schema: GetModelTemplatesResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/createFromTemplates': {
    post: {
      summary: '从模板批量创建模型',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: CreateModelsFromTemplatesBodySchema } }
      },
      responses: {
        200: {
          description: '实际创建的模型列表',
          content: {
            'application/json': { schema: CreateModelsFromTemplatesResponseSchema }
          }
        }
      }
    }
  },
  '/core/ai/model/delete': {
    delete: {
      summary: '批量删除模型',
      description: '按 modelIds 批量删除模型；支持系统模型和团队模型',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: DeleteModelsBodySchema } }
      },
      responses: { 200: { description: '删除成功' } }
    }
  },
  '/core/ai/model/test': {
    get: {
      summary: '测试模型配置',
      tags: [DevApiTagsMap.model],
      requestParams: { query: TestModelQuerySchema },
      responses: {
        200: { description: '测试成功' }
      }
    },
    post: {
      summary: '测试新增或编辑中的模型草稿',
      description: '使用当前表单草稿和指定渠道发起测试，不持久化模型',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: TestDraftModelBodySchema } }
      },
      responses: {
        200: { description: '测试成功' }
      }
    }
  },
  '/core/ai/model/update': {
    put: {
      summary: '更新模型配置',
      description: '按 modelId 更新已有模型的可编辑参数，支持修改模型标识（model）',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateModelBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/core/ai/model/updateChannels': {
    post: {
      summary: '调整模型关联的渠道',
      description:
        '按 modelId 追加或解除渠道关联；渠道只在模型所属桶（系统/当前成员）内解析，未命中按不存在处理。解除关联只清理渠道内该模型的映射，不删除渠道。',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateModelChannelsBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/core/ai/model/updateStatus': {
    put: {
      summary: '批量更新模型启停状态',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateModelStatusBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/core/ai/model/getConfigJson': {
    get: {
      summary: '导出模型配置',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: '最新模型配置 JSON',
          content: { 'application/json': { schema: GetSystemModelConfigJsonResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/updateWithJson': {
    put: {
      summary: '导入模型配置',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateSystemModelsWithJsonBodySchema } }
      },
      responses: { 200: { description: '导入成功' } }
    }
  },
  '/core/ai/model/updateDefault': {
    put: {
      summary: '更新默认模型',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateDefaultModelsBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/core/ai/model/summary': {
    post: {
      summary: '批量获取模型展示详情',
      description: '返回模型名称、图标及当前身份的可用状态，不返回执行配置',
      tags: [DevApiTagsMap.model, SystemOpenApiTagMap.model],
      requestBody: { content: { 'application/json': { schema: GetModelSummariesBodySchema } } },
      responses: {
        200: {
          description: '正常、停用、已下架或无权限的展示详情',
          content: { 'application/json': { schema: GetModelSummariesResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/list': {
    get: {
      summary: '获取公开系统模型',
      description: '返回价格页展示所需的最小化 active 系统模型与价格信息，无需鉴权',
      tags: [DevApiTagsMap.model, SystemOpenApiTagMap.model],
      responses: {
        200: {
          description: '成功返回公开系统模型列表',
          content: { 'application/json': { schema: GetSystemModelsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/config': {
    get: {
      summary: '获取模型管理配置',
      description: '按显式作用域返回系统或当前成员的模型、渠道和 Provider 配置',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetModelConfigQuerySchema },
      responses: {
        200: {
          description: '模型管理配置',
          content: { 'application/json': { schema: GetModelConfigResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/catalog': {
    get: {
      summary: '获取当前成员可用模型清单',
      description:
        '通过登录态或外链身份一次返回对应成员完整可用模型、Provider 和有效默认模型 ID；支持内容版本协商',
      tags: [DevApiTagsMap.model, SystemOpenApiTagMap.model],
      requestParams: { query: GetModelCatalogQuerySchema },
      responses: {
        200: {
          description: '版本变化时返回完整目录，未变化时仅返回版本',
          content: { 'application/json': { schema: GetModelCatalogResponseSchema } }
        }
      }
    }
  },
  '/proApi/system/model/collaborator/list': {
    get: {
      summary: '获取模型协作者',
      description:
        '按稳定模型 ID 获取协作者。系统模型可用范围对登录成员公开；团队私有模型仅所有者或具备模型管理权限的协作者可读。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: ModelCollaboratorListQuerySchema },
      responses: {
        200: {
          description: '成功返回模型协作者',
          content: { 'application/json': { schema: CollaboratorListSchema } }
        }
      }
    }
  },
  '/proApi/system/model/collaborator/batchList': {
    post: {
      summary: '批量获取模型协作者',
      description:
        '批量获取多个稳定模型 ID 对应的协作者，读取策略与单条接口一致；不可见私有模型返回空项。',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: ModelCollaboratorBatchListBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回模型协作者映射表',
          content: { 'application/json': { schema: ModelCollaboratorBatchListResponseSchema } }
        }
      }
    }
  },
  '/proApi/system/model/collaborator/update': {
    post: {
      summary: '更新模型协作者',
      description: '按稳定模型 ID 批量更新协作者',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: ModelCollaboratorUpdateBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  }
};
