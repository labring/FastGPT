import {
  CreateDatasetBodySchema,
  DeleteDatasetQuerySchema,
  GetDatasetDetailQuerySchema,
  GetDatasetListV2BodySchema,
  SearchDatasetTestBodySchema,
  UpdateDatasetBodySchema,
  type CreateDatasetBody,
  type GetDatasetDetailResponse,
  type GetDatasetListV2Response,
  type SearchDatasetTestBody,
  type SearchDatasetTestResponse,
  type UpdateDatasetBody
} from '@fastgpt/global/openapi/core/dataset/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type DatasetListParams = {
  searchKey?: string;
  parentId?: string | null;
  type?: string;
  page?: number;
  pageSize?: number;
};

export type DatasetCreateParams = Pick<CreateDatasetBody, 'name'> &
  Partial<Omit<CreateDatasetBody, 'name' | 'type'>> & {
    type?: string;
  };

export type DatasetUpdateParams = Partial<Omit<UpdateDatasetBody, 'id'>>;

export type DatasetSearchParams = {
  datasetId: string;
  text: string;
} & Partial<Omit<Extract<SearchDatasetTestBody, { text?: unknown }>, 'datasetId' | 'text'>>;

export type DatasetService = {
  list: (params: {
    client: FastGptHttpClient;
    input: DatasetListParams;
  }) => Promise<CliResult<GetDatasetListV2Response>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    datasetId: string;
  }) => Promise<CliResult<GetDatasetDetailResponse>>;
  create: (params: {
    client: FastGptHttpClient;
    input: DatasetCreateParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  update: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    input: DatasetUpdateParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  delete: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  search: (params: {
    client: FastGptHttpClient;
    input: DatasetSearchParams;
  }) => Promise<CliResult<SearchDatasetTestResponse>>;
};

/**
 * 知识库领域服务：封装知识库的查询、创建、更新、删除及召回检索测试。
 * 所有请求载荷与数据模型均从 @fastgpt/global/openapi 中的共享契约直接推导复用，保证 dryRun 与实际执行一致。
 */
export function createDatasetService(): DatasetService {
  return {
    list: async ({ client, input }) => {
      const body = {
        ...(input.page !== undefined ? { pageNum: input.page } : {}),
        ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
        parentId: input.parentId === undefined ? null : input.parentId,
        ...(input.searchKey ? { searchKey: input.searchKey } : {}),
        ...(input.type ? { type: input.type as any } : {})
      };

      const validatedBody = GetDatasetListV2BodySchema.parse(body);

      const res = await client.request<GetDatasetListV2Response>({
        method: 'POST',
        path: '/core/dataset/listV2',
        body: validatedBody
      });

      const actualPage =
        'pageNum' in validatedBody && typeof validatedBody.pageNum === 'number'
          ? validatedBody.pageNum
          : 1;
      const actualPageSize =
        'pageSize' in validatedBody && typeof validatedBody.pageSize === 'number'
          ? validatedBody.pageSize
          : 20;
      const hasMore = actualPage * actualPageSize < res.total;

      return createSuccessResult({
        data: res,
        meta: {
          total: res.total,
          page: actualPage,
          pageSize: actualPageSize,
          hasMore,
          count: res.list.length
        }
      });
    },

    getDetail: async ({ client, datasetId }) => {
      const validatedQuery = GetDatasetDetailQuerySchema.parse({ id: datasetId?.trim() });

      const res = await client.request<GetDatasetDetailResponse>({
        method: 'GET',
        path: '/core/dataset/detail',
        query: { id: validatedQuery.id }
      });

      return createSuccessResult({ data: res });
    },

    create: async ({ client, input, dryRun }) => {
      const payload = {
        name: input.name?.trim(),
        intro: input.intro ?? '',
        type: input.type ?? 'dataset',
        parentId: input.parentId === undefined ? null : input.parentId,
        ...(input.vectorModelId ? { vectorModelId: input.vectorModelId } : {}),
        ...(input.agentModelId ? { agentModelId: input.agentModelId } : {}),
        ...(input.avatar ? { avatar: input.avatar } : {})
      };

      const validatedBody = CreateDatasetBodySchema.parse(payload);

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/create',
            payload: validatedBody
          }
        });
      }

      const datasetId = await client.request<string>({
        method: 'POST',
        path: '/core/dataset/create',
        body: validatedBody
      });

      return createChangedResult({
        data: { datasetId, name: validatedBody.name },
        message: `Dataset "${validatedBody.name}" created successfully (ID: ${datasetId}).`
      });
    },

    update: async ({ client, datasetId, input, dryRun }) => {
      const payload = {
        id: datasetId?.trim(),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
        ...(input.agentModelId !== undefined ? { agentModelId: input.agentModelId } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {})
      };

      const validatedBody = UpdateDatasetBodySchema.parse(payload);

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset update',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/update',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/core/dataset/update',
        body: validatedBody
      });

      return createChangedResult({
        data: { datasetId: validatedBody.id },
        message: `Dataset "${validatedBody.id}" updated successfully.`
      });
    },

    delete: async ({ client, datasetId, dryRun }) => {
      const validatedQuery = DeleteDatasetQuerySchema.parse({ id: datasetId?.trim() });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset delete',
          risk: 'destructive',
          preview: {
            method: 'DELETE',
            path: '/core/dataset/delete',
            query: { id: validatedQuery.id }
          }
        });
      }

      await client.request({
        method: 'DELETE',
        path: '/core/dataset/delete',
        query: { id: validatedQuery.id }
      });

      return createChangedResult({
        data: { datasetId: validatedQuery.id, deleted: true },
        message: `Dataset "${validatedQuery.id}" deleted successfully.`
      });
    },

    search: async ({ client, input }) => {
      const payload = {
        datasetId: input.datasetId?.trim(),
        text: input.text?.trim(),
        limit: input.limit ?? 5000,
        similarity: input.similarity ?? 0,
        searchMode: input.searchMode ?? 'mixedRecall',
        usingReRank: input.usingReRank ?? false
      };

      const validatedBody = SearchDatasetTestBodySchema.parse(payload);

      const res = await client.request<SearchDatasetTestResponse>({
        method: 'POST',
        path: '/core/dataset/searchTest',
        body: validatedBody
      });

      return createSuccessResult({
        data: res,
        message: `Retrieved ${res.list.length} chunks (${res.duration}) using mode "${res.searchMode}"`
      });
    }
  };
}
