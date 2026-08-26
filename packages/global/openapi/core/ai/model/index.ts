import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetMyModelQuerySchema,
  GetMyModelResponseSchema,
  GetMyModelsQuerySchema,
  GetMyModelsResponseSchema,
  ModelCollaboratorListQuerySchema,
  ModelCollaboratorListResponseSchema,
  ModelCollaboratorUpdateBodySchema
} from './api';

export const AIModelPath: OpenAPIPath = {
  '/core/ai/model/getMyModels': {
    get: {
      summary: '分页获取当前账号可用模型',
      description: '按模型类型和 Provider 分页获取当前团队成员有权使用的模型',
      tags: [DevApiTagsMap.aiCommon],
      requestParams: { query: GetMyModelsQuerySchema },
      responses: {
        200: {
          description: '成功返回模型分页',
          content: { 'application/json': { schema: GetMyModelsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/getMyModel': {
    get: {
      summary: '获取当前账号可用的单个模型',
      description: '用于分页选择器根据 modelId 回显当前页之外的已选模型',
      tags: [DevApiTagsMap.aiCommon],
      requestParams: { query: GetMyModelQuerySchema },
      responses: {
        200: {
          description: '成功返回模型',
          content: { 'application/json': { schema: GetMyModelResponseSchema } }
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
