import type {
  GetDatasetDetailResponse,
  GetDatasetListV2Response,
  SearchDatasetTestResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type DatasetListParams = {
  searchKey?: string;
  parentId?: string | null;
  type?: string;
  page?: number;
  pageSize?: number;
};

export type DatasetCreateParams = {
  name: string;
  intro?: string;
  type?: 'dataset' | 'folder' | 'websiteDataset';
  vectorModelId?: string;
  agentModelId?: string;
  parentId?: string | null;
  avatar?: string;
};

export type DatasetUpdateParams = {
  name?: string;
  intro?: string;
  agentModelId?: string;
  avatar?: string;
  parentId?: string | null;
};

export type DatasetSearchParams = {
  datasetId: string;
  text: string;
  limit?: number;
  similarity?: number;
  searchMode?: 'embedding' | 'fullTextRecall' | 'mixedRecall';
  usingReRank?: boolean;
};

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
  delete: (params: { client: FastGptHttpClient; datasetId: string }) => Promise<CliResult>;
  search: (params: {
    client: FastGptHttpClient;
    input: DatasetSearchParams;
  }) => Promise<CliResult<SearchDatasetTestResponse>>;
};

/**
 * 知识库领域服务：封装知识库的查询、创建、更新、删除及召回检索测试。
 */
export function createDatasetService(): DatasetService {
  return {
    list: async ({ client, input }) => {
      const pageNum = input.page && input.page > 0 ? input.page : 1;
      const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 20;

      const body = {
        pageNum,
        pageSize,
        parentId: input.parentId === undefined ? null : input.parentId,
        ...(input.searchKey ? { searchKey: input.searchKey } : {}),
        ...(input.type ? { type: input.type as any } : {})
      };

      const res = await client.request<GetDatasetListV2Response>({
        method: 'POST',
        path: '/core/dataset/listV2',
        body
      });

      return createSuccessResult({
        data: res,
        meta: {
          total: res.total,
          pageNum,
          pageSize,
          count: res.list.length
        }
      });
    },

    getDetail: async ({ client, datasetId }) => {
      if (!datasetId.trim()) {
        throw new CliArgumentError('Dataset ID is required.');
      }

      const res = await client.request<GetDatasetDetailResponse>({
        method: 'GET',
        path: '/core/dataset/detail',
        query: { id: datasetId.trim() }
      });

      return createSuccessResult({ data: res });
    },

    create: async ({ client, input, dryRun }) => {
      if (!input.name.trim()) {
        throw new CliArgumentError('Dataset name is required.');
      }

      const payload = {
        name: input.name.trim(),
        intro: input.intro ?? '',
        type: (input.type ?? 'dataset') as any,
        parentId: input.parentId ?? null,
        ...(input.vectorModelId ? { vectorModelId: input.vectorModelId } : {}),
        ...(input.agentModelId ? { agentModelId: input.agentModelId } : {}),
        ...(input.avatar ? { avatar: input.avatar } : {})
      };

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset create',
          preview: {
            method: 'POST',
            path: '/core/dataset/create',
            payload
          }
        });
      }

      const datasetId = await client.request<string>({
        method: 'POST',
        path: '/core/dataset/create',
        body: payload
      });

      return createChangedResult({
        data: { datasetId, name: input.name },
        message: `Dataset "${input.name}" created successfully (ID: ${datasetId}).`
      });
    },

    update: async ({ client, datasetId, input, dryRun }) => {
      if (!datasetId.trim()) {
        throw new CliArgumentError('Dataset ID is required.');
      }

      const payload = {
        id: datasetId.trim(),
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
        ...(input.agentModelId ? { agentModelId: input.agentModelId } : {}),
        ...(input.avatar ? { avatar: input.avatar } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {})
      };

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset update',
          preview: {
            method: 'POST',
            path: '/core/dataset/update',
            payload
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/core/dataset/update',
        body: payload
      });

      return createChangedResult({
        data: { datasetId: datasetId.trim() },
        message: `Dataset "${datasetId.trim()}" updated successfully.`
      });
    },

    delete: async ({ client, datasetId }) => {
      if (!datasetId.trim()) {
        throw new CliArgumentError('Dataset ID is required.');
      }

      await client.request({
        method: 'DELETE',
        path: '/core/dataset/delete',
        query: { id: datasetId.trim() }
      });

      return createChangedResult({
        data: { datasetId: datasetId.trim(), deleted: true },
        message: `Dataset "${datasetId.trim()}" deleted successfully.`
      });
    },

    search: async ({ client, input }) => {
      if (!input.datasetId.trim()) {
        throw new CliArgumentError('Dataset ID is required.');
      }
      if (!input.text.trim()) {
        throw new CliArgumentError('Search query text is required.');
      }

      const body = {
        datasetId: input.datasetId.trim(),
        text: input.text.trim(),
        limit: input.limit ?? 5000,
        similarity: input.similarity ?? 0,
        searchMode: input.searchMode ?? 'mixedRecall',
        usingReRank: input.usingReRank ?? false
      };

      const res = await client.request<SearchDatasetTestResponse>({
        method: 'POST',
        path: '/core/dataset/searchTest',
        body
      });

      return createSuccessResult({
        data: res,
        message: `Retrieved ${res.list.length} chunks (${res.duration}) using mode "${res.searchMode}"`
      });
    }
  };
}
