import {
  CreateDatasetDataIndexBodySchema,
  DeleteDatasetDataIndexBodySchema,
  DeleteDatasetDataQuerySchema,
  GetDatasetDataDetailQuerySchema,
  GetDatasetDataListBodySchema,
  GetQuoteDataBodySchema,
  InsertDataBodySchema,
  PushDataBodySchema,
  UpdateDatasetDataBodySchema,
  UpdateDatasetDataIndexBodySchema,
  type CreateDatasetDataIndexBody,
  type DatasetDataIndexResponse,
  type DeleteDatasetDataIndexBody,
  type GetDatasetDataDetailResponse,
  type GetDatasetDataListBody,
  type GetDatasetDataListResponse,
  type GetQuoteDataResponse,
  type InsertDataBody,
  type InsertDataResponse,
  type PushDataBody,
  type PushDataResponseType,
  type UpdateDatasetDataBody,
  type UpdateDatasetDataIndexBody,
  type UpdateDatasetDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { buildPaginationMeta } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type DataListParams = Pick<GetDatasetDataListBody, 'collectionId'> &
  Partial<Omit<GetDatasetDataListBody, 'collectionId'>> & {
    page?: number;
  };

export type DataInsertParams = InsertDataBody;
export type DataPushParams = PushDataBody;
export type DataUpdateParams = UpdateDatasetDataBody;
export type DataIndexCreateParams = CreateDatasetDataIndexBody;
export type DataIndexUpdateParams = UpdateDatasetDataIndexBody;
export type DataIndexDeleteParams = DeleteDatasetDataIndexBody;

export type DatasetDataService = {
  list: (params: {
    client: FastGptHttpClient;
    input: DataListParams;
  }) => Promise<CliResult<GetDatasetDataListResponse>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    dataId: string;
  }) => Promise<CliResult<GetDatasetDataDetailResponse>>;
  getQuoteData: (params: {
    client: FastGptHttpClient;
    dataId: string;
  }) => Promise<CliResult<GetQuoteDataResponse>>;
  insert: (params: {
    client: FastGptHttpClient;
    input: DataInsertParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
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
  createIndex: (params: {
    client: FastGptHttpClient;
    input: DataIndexCreateParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  updateIndex: (params: {
    client: FastGptHttpClient;
    input: DataIndexUpdateParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  deleteIndex: (params: {
    client: FastGptHttpClient;
    input: DataIndexDeleteParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * 知识库分块数据与向量索引领域服务（PRD-02.3）。
 */
export function createDatasetDataService(): DatasetDataService {
  return {
    list: async ({ client, input }) => {
      const { page, ...rest } = input;
      const validatedBody = GetDatasetDataListBodySchema.parse({
        ...rest,
        collectionId: input.collectionId?.trim(),
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
      const validatedQuery = GetDatasetDataDetailQuerySchema.parse({ id: dataId?.trim() });

      const res = await client.request<GetDatasetDataDetailResponse>({
        method: 'GET',
        path: '/core/dataset/data/detail',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
    },

    getQuoteData: async ({ client, dataId }) => {
      const validatedBody = GetQuoteDataBodySchema.parse({ id: dataId?.trim() });

      const res = await client.request<GetQuoteDataResponse>({
        method: 'POST',
        path: '/core/dataset/data/getQuoteData',
        body: validatedBody
      });

      return createSuccessResult({ data: res });
    },

    insert: async ({ client, input, dryRun }) => {
      const validatedBody = InsertDataBodySchema.parse({
        ...input,
        collectionId: input.collectionId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset data insert',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/data/insertData',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<InsertDataResponse>({
        method: 'POST',
        path: '/core/dataset/data/insertData',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Inserted data chunk into collection "${validatedBody.collectionId}" (IDs: ${res.dataIds.join(', ')}).`
      });
    },

    push: async ({ client, input, dryRun }) => {
      const validatedBody = PushDataBodySchema.parse({
        ...input,
        collectionId: input.collectionId?.trim()
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
        dataId: input.dataId?.trim()
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
      const validatedQuery = DeleteDatasetDataQuerySchema.parse({ id: dataId?.trim() });

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
    },

    createIndex: async ({ client, input, dryRun }) => {
      const validatedBody = CreateDatasetDataIndexBodySchema.parse({
        ...input,
        dataId: input.dataId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset data index-create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/data/index/create',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<DatasetDataIndexResponse>({
        method: 'POST',
        path: '/core/dataset/data/index/create',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Created index on data chunk "${validatedBody.dataId}".`
      });
    },

    updateIndex: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateDatasetDataIndexBodySchema.parse({
        ...input,
        dataId: input.dataId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset data index-update',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/data/index/update',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<DatasetDataIndexResponse>({
        method: 'POST',
        path: '/core/dataset/data/index/update',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Updated index "${validatedBody.indexDataId}" on data chunk "${validatedBody.dataId}".`
      });
    },

    deleteIndex: async ({ client, input, dryRun }) => {
      const validatedBody = DeleteDatasetDataIndexBodySchema.parse({
        ...input,
        dataId: input.dataId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset data index-delete',
          risk: 'destructive',
          preview: {
            method: 'POST',
            path: '/core/dataset/data/index/delete',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/core/dataset/data/index/delete',
        body: validatedBody
      });

      return createChangedResult({
        data: {
          dataId: validatedBody.dataId,
          indexDataId: validatedBody.indexDataId,
          deleted: true
        },
        message: `Deleted index "${validatedBody.indexDataId}" from data chunk "${validatedBody.dataId}".`
      });
    }
  };
}
