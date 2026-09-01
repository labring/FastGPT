import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetSystemModelsResponseSchema,
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  ModelCollaboratorListQuerySchema,
  ModelCollaboratorListResponseSchema,
  ModelCollaboratorUpdateBodySchema
} from './api';

export const AIModelPath: OpenAPIPath = {
  '/core/ai/model/list': {
    get: {
      summary: '获取公开系统模型',
      description: '返回价格页展示所需的最小化 active 系统模型与价格信息，无需鉴权',
      tags: [DevApiTagsMap.aiCommon],
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
      summary: '获取当前成员模型目录',
      description:
        '通过登录态或外链身份一次返回对应成员完整可用模型、Provider 和有效默认模型 ID；支持内容版本协商',
      tags: [DevApiTagsMap.aiCommon],
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
      tags: [DevApiTagsMap.aiCommon],
      requestParams: { query: ModelCollaboratorListQuerySchema },
      responses: {
        200: {
          description: '成功返回模型协作者',
          content: { 'application/json': { schema: ModelCollaboratorListResponseSchema } }
        }
      }
    }
  },
  '/proApi/system/model/collaborator/update': {
    post: {
      summary: '更新模型协作者',
      description: '按稳定模型 ID 批量更新协作者',
      tags: [DevApiTagsMap.aiCommon],
      requestBody: {
        content: { 'application/json': { schema: ModelCollaboratorUpdateBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  }
};
