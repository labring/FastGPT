import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import type { OpenAPIPath } from '../../../type';
import {
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  GetSystemModelsResponseSchema,
  GetTeamModelsResponseSchema,
  ModelCollaboratorBatchListBodySchema,
  ModelCollaboratorBatchListResponseSchema,
  ModelCollaboratorListQuerySchema,
  ModelCollaboratorListResponseSchema,
  ModelCollaboratorUpdateBodySchema
} from './api';
import { GetModelSummariesBodySchema, GetModelSummariesResponseSchema } from './summary';

export const AIModelPath: OpenAPIPath = {
  '/core/ai/model/teamModels': {
    get: {
      summary: '获取团队私有模型列表',
      description: '获取当前登录成员名下的团队私有模型列表及关联的团队渠道摘要',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: '成功返回团队私有模型列表',
          content: { 'application/json': { schema: GetTeamModelsResponseSchema } }
        }
      }
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
      description: '按稳定模型 ID 获取协作者',
      tags: [DevApiTagsMap.model],
      requestParams: { query: ModelCollaboratorListQuerySchema },
      responses: {
        200: {
          description: '成功返回模型协作者',
          content: { 'application/json': { schema: ModelCollaboratorListResponseSchema } }
        }
      }
    }
  },
  '/proApi/system/model/collaborator/batchList': {
    post: {
      summary: '批量获取模型协作者',
      description: '批量获取多个稳定模型 ID 对应的协作者',
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
