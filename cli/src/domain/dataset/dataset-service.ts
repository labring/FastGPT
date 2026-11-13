import {
  BatchResourceDeleteBodySchema,
  BatchResourceMoveBodySchema,
  type BatchResourceActionResponse
} from '@fastgpt/global/openapi/common/batch/api';
import {
  CreateDatasetBodySchema,
  DeleteDatasetQuerySchema,
  DisableCollectionPermissionBodySchema,
  EnableCollectionPermissionBodySchema,
  ExportDatasetQuerySchema,
  GetDatasetDetailQuerySchema,
  GetDatasetListV2BodySchema,
  GetDatasetPathsQuerySchema,
  GetDatasetPermissionQuerySchema,
  PostDatasetSyncBodySchema,
  ResumeDatasetInheritPermissionBodySchema,
  SearchDatasetTestBodySchema,
  UpdateDatasetBodySchema,
  type CreateDatasetBody,
  type DisableCollectionPermissionResponse,
  type EnableCollectionPermissionResponse,
  type GetDatasetDetailResponse,
  type GetDatasetListV2Response,
  type GetDatasetPathsResponse,
  type GetDatasetPermissionResponse,
  type SearchDatasetTestBody,
  type SearchDatasetTestResponse,
  type UpdateDatasetBody
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  LONG_OPERATION_TIMEOUT_MS,
  type FastGptHttpClient
} from '../../infra/http/fastgpt-http-client';
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

export type DatasetUpdateParams = Partial<Omit<UpdateDatasetBody, 'id'>>;

export type DatasetSearchParams = {
  datasetId: string;
  text?: string;
  queryImageUrls?: string[];
} & Partial<
  Omit<Extract<SearchDatasetTestBody, { text?: unknown }>, 'datasetId' | 'text' | 'queryImageUrls'>
>;

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
  exportAll: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    writeOutput?: (data: Uint8Array) => Promise<string>;
    writeStreamOutput?: (
      stream: ReadableStream<Uint8Array>
    ) => Promise<{ path: string; bytes: number }>;
  }) => Promise<CliResult>;
  sync: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  paths: (params: {
    client: FastGptHttpClient;
    sourceId?: string;
    type?: 'current' | 'parent';
  }) => Promise<CliResult<GetDatasetPathsResponse>>;
  getPermission: (params: {
    client: FastGptHttpClient;
    datasetId: string;
  }) => Promise<CliResult<GetDatasetPermissionResponse>>;
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
  setCollectionPermission: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    enabled: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  resumeInheritPermission: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * 知识库主资源领域服务：封装知识库 CRUD、召回检索、全量导出、同步、路径、批量移动/删除及权限治理。
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

    update: async ({ client, datasetId, input, dryRun }) => {
      const payload = {
        ...input,
        id: trimIfString(datasetId),
        ...(input.name !== undefined ? { name: trimIfString(input.name) } : {})
      };

      const validatedBody = UpdateDatasetBodySchema.parse(payload);

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
        ...input,
        datasetId: trimIfString(input.datasetId),
        ...(input.text !== undefined ? { text: trimIfString(input.text) } : {}),
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
    },

    exportAll: async ({ client, datasetId, writeOutput, writeStreamOutput }) => {
      const validatedQuery = ExportDatasetQuerySchema.parse({ datasetId: datasetId?.trim() });

      const rawResp = await client.requestRaw({
        method: 'GET',
        path: '/core/dataset/exportAll',
        query: { datasetId: validatedQuery.datasetId },
        timeoutMs: LONG_OPERATION_TIMEOUT_MS
      });

      if (writeStreamOutput && rawResp.body) {
        const written = await writeStreamOutput(rawResp.body);
        return createSuccessResult({
          data: {
            datasetId: validatedQuery.datasetId,
            outputPath: written.path,
            bytes: written.bytes
          },
          message: `Exported dataset "${validatedQuery.datasetId}" (${written.bytes} bytes) to "${written.path}".`
        });
      }

      const arrayBuf = await rawResp.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);

      if (writeOutput) {
        const outputPath = await writeOutput(bytes);
        return createSuccessResult({
          data: {
            datasetId: validatedQuery.datasetId,
            outputPath,
            bytes: bytes.byteLength
          },
          message: `Exported dataset "${validatedQuery.datasetId}" (${bytes.byteLength} bytes) to "${outputPath}".`
        });
      }

      const csvText = new TextDecoder('utf-8').decode(bytes);
      return createSuccessResult({
        data: {
          datasetId: validatedQuery.datasetId,
          bytes: bytes.byteLength,
          csv: csvText
        },
        message: `Exported dataset "${validatedQuery.datasetId}" (${bytes.byteLength} bytes).`
      });
    },

    sync: async ({ client, datasetId, dryRun }) => {
      const validatedBody = PostDatasetSyncBodySchema.parse({ datasetId: datasetId?.trim() });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset sync',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/proApi/core/dataset/datasetSync',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/proApi/core/dataset/datasetSync',
        body: validatedBody
      });

      return createChangedResult({
        data: { datasetId: validatedBody.datasetId, synced: true },
        message: `Dataset "${validatedBody.datasetId}" sync task triggered.`
      });
    },

    paths: async ({ client, sourceId, type = 'current' }) => {
      const validatedQuery = GetDatasetPathsQuerySchema.parse({
        ...(sourceId ? { sourceId: sourceId.trim() } : {}),
        type
      });

      const res = await client.request<GetDatasetPathsResponse>({
        method: 'GET',
        path: '/core/dataset/paths',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
    },

    getPermission: async ({ client, datasetId }) => {
      const validatedQuery = GetDatasetPermissionQuerySchema.parse({ id: datasetId?.trim() });

      const res = await client.request<GetDatasetPermissionResponse>({
        method: 'GET',
        path: '/core/dataset/getPermission',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
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
    },

    setCollectionPermission: async ({ client, datasetId, enabled, dryRun }) => {
      const path = enabled
        ? '/core/dataset/enableCollectionPermission'
        : '/core/dataset/disableCollectionPermission';
      const validatedBody = enabled
        ? EnableCollectionPermissionBodySchema.parse({ datasetId: datasetId?.trim() })
        : DisableCollectionPermissionBodySchema.parse({ datasetId: datasetId?.trim() });

      if (dryRun) {
        return createDryRunResult({
          operation: enabled
            ? 'dataset enable-collection-permission'
            : 'dataset disable-collection-permission',
          risk: enabled ? 'write' : 'destructive',
          preview: {
            method: 'POST',
            path,
            payload: validatedBody
          }
        });
      }

      const res = await client.request<
        EnableCollectionPermissionResponse | DisableCollectionPermissionResponse
      >({
        method: 'POST',
        path,
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: enabled
          ? `Collection-level permissions enabled (${res.collectionCount} collections materialized).`
          : `Collection-level permissions disabled (${res.collectionCount} collections reset).`
      });
    },

    resumeInheritPermission: async ({ client, datasetId, dryRun }) => {
      const validatedBody = ResumeDatasetInheritPermissionBodySchema.parse({
        datasetId: datasetId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset resume-inherit-permission',
          risk: 'write',
          preview: {
            method: 'PUT',
            path: '/core/dataset/resumeInheritPermission',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'PUT',
        path: '/core/dataset/resumeInheritPermission',
        body: validatedBody
      });

      return createChangedResult({
        data: { datasetId: validatedBody.datasetId, resumedInheritPermission: true },
        message: `Resumed inherited permissions for dataset "${validatedBody.datasetId}".`
      });
    }
  };
}
