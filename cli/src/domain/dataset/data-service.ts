import {
  DeleteDatasetDataQuerySchema,
  GetDatasetDataDetailQuerySchema,
  GetDatasetDataListBodySchema,
  PushDataBodySchema,
  UpdateDatasetDataBodySchema,
  type GetDatasetDataDetailResponse,
  type GetDatasetDataListBody,
  type GetDatasetDataListResponse,
  type PushDataBody,
  type PushDataResponseType,
  type UpdateDatasetDataBody,
  type UpdateDatasetDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type DataListParams = Pick<GetDatasetDataListBody, 'collectionId'> &
  Partial<Omit<GetDatasetDataListBody, 'collectionId'>> & {
    page?: number;
  };

export type DataPushParams = PushDataBody;
export type DataUpdateParams = UpdateDatasetDataBody;

export type DatasetDataService = {
  list: (params: {
    client: FastGptHttpClient;
    input: DataListParams;
  }) => Promise<CliResult<GetDatasetDataListResponse>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    dataId: string;
  }) => Promise<CliResult<GetDatasetDataDetailResponse>>;
  push: (params: {
    client: FastGptHttpClient;
    input: DataPushParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  update: (params: {
    client: FastGptHttpClient;
    input: DataUpdateParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  delete: (params: {
    client: FastGptHttpClient;
    dataId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * 知识库分块数据领域服务：仅封装 System OpenAPI 标准接口（列表、详情、批量推送、更新、删除）。
 */
export function createDatasetDataService(): DatasetDataService {
  return {
    list: async ({ client, input }) => {
      const { page, ...rest } = input;
      const validatedBody = GetDatasetDataListBodySchema.parse({
        ...rest,
        collectionId: trimIfString(input.collectionId),
        ...(page !== undefined ? { pageNum: page } : {})
      });

      const res = await client.request<GetDatasetDataListResponse>({
        method: 'POST',
        path: '/core/dataset/data/v2/list',
        body: validatedBody
      });

      return createSuccessResult({
        data: res,
        meta: buildPaginationMeta({
          validatedBody: validatedBody as Record<string, unknown>,
          total: res.total,
          count: res.list.length
        })
      });
    },

    getDetail: async ({ client, dataId }) => {
      const validatedQuery = GetDatasetDataDetailQuerySchema.parse({ id: trimIfString(dataId) });

      const res = await client.request<GetDatasetDataDetailResponse>({
        method: 'GET',
        path: '/core/dataset/data/detail',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
    },

    push: async ({ client, input, dryRun }) => {
      const validatedBody = PushDataBodySchema.parse({
        ...input,
        collectionId: trimIfString(input.collectionId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset data push',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/data/pushData',
            collectionId: validatedBody.collectionId,
            chunkCount: validatedBody.data.length,
            trainingType: validatedBody.trainingType,
            sample: validatedBody.data.slice(0, 3)
          }
        });
      }

      const res = await client.request<PushDataResponseType>({
        method: 'POST',
        path: '/core/dataset/data/pushData',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Pushed ${res.insertLen} data chunks to collection "${validatedBody.collectionId}".`
      });
    },

    update: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateDatasetDataBodySchema.parse({
        ...input,
        dataId: trimIfString(input.dataId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset data update',
          risk: 'write',
          preview: {
            method: 'PUT',
            path: '/core/dataset/data/update',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<UpdateDatasetDataResponse>({
        method: 'PUT',
        path: '/core/dataset/data/update',
        body: validatedBody
      });

      return createChangedResult({
        data: { dataId: validatedBody.dataId, ...res },
        message: `Updated data chunk "${validatedBody.dataId}".`
      });
    },

    delete: async ({ client, dataId, dryRun }) => {
      const validatedQuery = DeleteDatasetDataQuerySchema.parse({ id: trimIfString(dataId) });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset data delete',
          risk: 'destructive',
          preview: {
            method: 'DELETE',
            path: '/core/dataset/data/delete',
            query: validatedQuery
          }
        });
      }

      await client.request({
        method: 'DELETE',
        path: '/core/dataset/data/delete',
        query: validatedQuery
      });

      return createChangedResult({
        data: { dataId: validatedQuery.id, deleted: true },
        message: `Deleted data chunk "${validatedQuery.id}".`
      });
    }
  };
}
