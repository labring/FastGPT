import {
  BatchResourceDeleteBodySchema,
  BatchResourceMoveBodySchema,
  type BatchResourceActionResponse
} from '@fastgpt/global/openapi/common/batch/api';
import {
  CreateDatasetBodySchema,
  DeleteDatasetQuerySchema,
  GetDatasetDetailQuerySchema,
  GetDatasetListV2BodySchema,
  UpdateDatasetBodySchema,
  type CreateDatasetBody,
  type GetDatasetDetailResponse,
  type GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  SearchDatasetRequestBodySchema,
  type SearchDatasetBody,
  type SearchDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/search/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type DatasetListParams = {
  searchKey?: string;
  parentId?: string | null;
  type?: string;
  datasetIds?: string[];
  withAppCount?: boolean;
  withFileCount?: boolean;
  page?: number;
  pageSize?: number;
  offset?: number;
};

export type DatasetCreateParams = Pick<CreateDatasetBody, 'name'> &
  Partial<Omit<CreateDatasetBody, 'name' | 'type'>> & {
    type?: string;
  };

export type DatasetFlatSearchParams = {
  datasetIds: string | string[];
  text: string;
  topk?: NonNullable<SearchDatasetBody['result']>['topk'];
  maxTokens?: NonNullable<SearchDatasetBody['result']>['maxTokens'];
  similarity?: NonNullable<SearchDatasetBody['result']>['similarity'];
  mode?: NonNullable<SearchDatasetBody['retrieval']>['mode'];
  embeddingWeight?: NonNullable<SearchDatasetBody['retrieval']>['embeddingWeight'];
  filter?: SearchDatasetBody['scope']['filter'];
  rerank?: SearchDatasetBody['rerank'];
  queryExtension?: SearchDatasetBody['queryExtension'];
  usageScene?: SearchDatasetBody['usageScene'];
};

export type DatasetSearchParams = SearchDatasetBody | DatasetFlatSearchParams;

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
    input: Record<string, unknown>;
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
  }) => Promise<CliResult<SearchDatasetResponse>>;
  batchMove: (params: {
    client: FastGptHttpClient;
    ids: string[];
    parentId: string | null;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  batchDelete: (params: {
    client: FastGptHttpClient;
    ids: string[];
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * 知识库主资源领域服务：仅封装 System OpenAPI 标准接口（列表、详情、创建、更新、删除、联合检索、批量移动/删除）。
 * 所有入参均复用 @fastgpt/global/openapi 中的共享 Zod 契约校验，保证 dryRun 与真实请求一致。
 */
export function createDatasetService(): DatasetService {
  return {
    list: async ({ client, input }) => {
      const body = (() => {
        const common = {
          ...(input.searchKey ? { searchKey: input.searchKey } : {}),
          ...(input.type ? { type: input.type as any } : {}),
          ...(input.withAppCount !== undefined ? { withAppCount: input.withAppCount } : {}),
          ...(input.withFileCount !== undefined ? { withFileCount: input.withFileCount } : {})
        };
        if (input.datasetIds && input.datasetIds.length > 0) {
          return {
            datasetIds: input.datasetIds,
            ...common
          };
        }
        return {
          ...(input.offset !== undefined ? { offset: input.offset } : {}),
          ...(input.page !== undefined ? { pageNum: input.page } : {}),
          ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
          parentId: input.parentId === undefined ? null : input.parentId,
          ...common
        };
      })();

      const validatedBody = GetDatasetListV2BodySchema.parse(body);

      const res = await client.request<GetDatasetListV2Response>({
        method: 'POST',
        path: '/core/dataset/listV2',
        body: validatedBody
      });

      return createSuccessResult({
        data: res,
        meta: buildPaginationMeta({
          validatedBody: validatedBody as Record<string, unknown>,
          total: res.total,
          count: res.list.length,
          nonPaginated: Boolean(input.datasetIds && input.datasetIds.length > 0)
        })
      });
    },

    getDetail: async ({ client, datasetId }) => {
      const validatedQuery = GetDatasetDetailQuerySchema.parse({ id: trimIfString(datasetId) });

      const res = await client.request<GetDatasetDetailResponse>({
        method: 'GET',
        path: '/core/dataset/detail',
        query: { id: validatedQuery.id }
      });

      return createSuccessResult({ data: res });
    },

    create: async ({ client, input, dryRun }) => {
      const payload = {
        ...input,
        name: trimIfString(input.name),
        intro: input.intro ?? '',
        type: input.type ?? 'dataset',
        parentId: input.parentId === undefined ? null : input.parentId
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

    /** 更新字段按共享契约校验；不补 parentId 等默认值，避免普通编辑触发移动或清空配置。 */
    update: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateDatasetBodySchema.parse({
        ...input,
        id: trimIfString(input.id),
        ...(input.name !== undefined ? { name: trimIfString(input.name) } : {})
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset update',
          risk: 'write',
          preview: {
            method: 'PUT',
            path: '/core/dataset/update',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'PUT',
        path: '/core/dataset/update',
        body: validatedBody
      });

      return createChangedResult({
        data: { datasetId: validatedBody.id },
        message: `Dataset "${validatedBody.id}" updated successfully.`
      });
    },

    delete: async ({ client, datasetId, dryRun }) => {
      const validatedQuery = DeleteDatasetQuerySchema.parse({ id: trimIfString(datasetId) });

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
      // 兼容结构化 SearchDatasetBody（来自 --file/--stdin）与扁平化 DatasetFlatSearchParams
      const payload = (() => {
        if ('scope' in input) {
          return input;
        }
        // 单个 ID、逗号分隔输入和 ID 数组统一适配；空项保留给共享 Schema 拒绝，避免静默缩小范围。
        const datasetIds = (
          Array.isArray(input.datasetIds) ? input.datasetIds : input.datasetIds.split(',')
        ).map((id) => trimIfString(id));

        return {
          scope: { datasetIds, ...(input.filter !== undefined ? { filter: input.filter } : {}) },
          query: { text: trimIfString(input.text) },
          retrieval: {
            ...(input.mode !== undefined ? { mode: input.mode } : {}),
            ...(input.embeddingWeight !== undefined
              ? { embeddingWeight: input.embeddingWeight }
              : {})
          },
          ...(input.rerank !== undefined ? { rerank: input.rerank } : {}),
          ...(input.queryExtension !== undefined ? { queryExtension: input.queryExtension } : {}),
          ...(input.usageScene !== undefined ? { usageScene: input.usageScene } : {}),
          result: {
            ...(input.topk !== undefined ? { topk: input.topk } : {}),
            ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
            ...(input.similarity !== undefined ? { similarity: input.similarity } : {})
          }
        };
      })();

      const validatedBody = SearchDatasetRequestBodySchema.parse(payload);

      const res = await client.request<SearchDatasetResponse>({
        method: 'POST',
        path: '/core/dataset/search',
        body: validatedBody
      });

      return createSuccessResult({
        data: res,
        message: `Retrieved ${res.list.length} chunks (${res.meta.durationMs}ms) using mode "${validatedBody.retrieval.mode}"`
      });
    },

    batchMove: async ({ client, ids, parentId, dryRun }) => {
      const validatedBody = BatchResourceMoveBodySchema.parse({ ids, parentId });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset batch-move',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/batch/move',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<BatchResourceActionResponse>({
        method: 'POST',
        path: '/core/dataset/batch/move',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Batch moved ${res.successIds.length} dataset(s) (${res.failedIds.length} failed).`
      });
    },

    batchDelete: async ({ client, ids, dryRun }) => {
      const validatedBody = BatchResourceDeleteBodySchema.parse({ ids });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset batch-delete',
          risk: 'destructive',
          preview: {
            method: 'POST',
            path: '/core/dataset/batch/delete',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<BatchResourceActionResponse>({
        method: 'POST',
        path: '/core/dataset/batch/delete',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Batch deleted ${res.successIds.length} dataset(s) (${res.failedIds.length} failed).`
      });
    }
  };
}
