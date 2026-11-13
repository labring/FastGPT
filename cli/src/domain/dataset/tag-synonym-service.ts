import {
  BatchSetCollectionTagsBodySchema,
  CreateDatasetCollectionTagBodySchema,
  DeleteDatasetCollectionTagQuerySchema,
  GetAllDatasetTagsQuerySchema,
  SetCollectionTagsBodySchema,
  UpdateDatasetCollectionTagBodySchema,
  type BatchSetCollectionTagsParams,
  type CreateDatasetCollectionTagParams,
  type SetCollectionTagsParams,
  type UpdateDatasetCollectionTagParams
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import {
  DeleteDatasetSynonymQuerySchema,
  DownloadDatasetSynonymQuerySchema,
  GetDatasetSynonymDetailQuerySchema,
  SearchDatasetSynonymMappingsBodySchema,
  UpdateDatasetSynonymBodySchema,
  UpdateDatasetSynonymFileBodySchema,
  UploadDatasetSynonymBodySchema,
  UploadDatasetSynonymFileBodySchema,
  type DatasetSynonymMutationResponse,
  type DeleteDatasetSynonymResponse,
  type GetDatasetSynonymDetailResponse,
  type SearchDatasetSynonymMappingsResponse,
  type UpdateDatasetSynonymBody,
  type UploadDatasetSynonymBody
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import type { LoadedBinaryFile } from '../../infra/fs/file-io';
import {
  LONG_OPERATION_TIMEOUT_MS,
  type FastGptHttpClient
} from '../../infra/http/fastgpt-http-client';
import { buildPaginationMeta } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type DatasetTagSynonymService = {
  // === Tag (Pro) ===
  listTags: (params: { client: FastGptHttpClient; datasetId: string }) => Promise<CliResult>;
  createTag: (params: {
    client: FastGptHttpClient;
    input: CreateDatasetCollectionTagParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  updateTag: (params: {
    client: FastGptHttpClient;
    input: UpdateDatasetCollectionTagParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  deleteTag: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    tagId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  setCollectionTags: (params: {
    client: FastGptHttpClient;
    input: SetCollectionTagsParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  batchSetCollectionTags: (params: {
    client: FastGptHttpClient;
    input: BatchSetCollectionTagsParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;

  // === Synonym ===
  getSynonymDetail: (params: {
    client: FastGptHttpClient;
    datasetId: string;
  }) => Promise<CliResult<GetDatasetSynonymDetailResponse>>;
  searchSynonymMappings: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<CliResult<SearchDatasetSynonymMappingsResponse>>;
  uploadSynonymMappings: (params: {
    client: FastGptHttpClient;
    input: UploadDatasetSynonymBody;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  uploadSynonymFile: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    file: LoadedBinaryFile;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  updateSynonymMappings: (params: {
    client: FastGptHttpClient;
    input: UpdateDatasetSynonymBody;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  updateSynonymFile: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    oldSynonymId: string;
    oldFileVersion: number;
    file: LoadedBinaryFile;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  deleteSynonym: (params: {
    client: FastGptHttpClient;
    synonymId: string;
    oldFileVersion: number;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  downloadSynonym: (params: {
    client: FastGptHttpClient;
    synonymId: string;
    writeOutput?: (data: Uint8Array) => Promise<string>;
  }) => Promise<CliResult>;
};

/**
 * 知识库标签（Pro）与同义词词表领域服务（PRD-02.3）。
 */
export function createDatasetTagSynonymService(): DatasetTagSynonymService {
  return {
    listTags: async ({ client, datasetId }) => {
      const validatedQuery = GetAllDatasetTagsQuerySchema.parse({ datasetId: datasetId?.trim() });
      const res = await client.request({
        method: 'GET',
        path: '/proApi/core/dataset/tag/getAllTags',
        query: validatedQuery
      });
      return createSuccessResult({ data: res });
    },

    createTag: async ({ client, input, dryRun }) => {
      const validatedBody = CreateDatasetCollectionTagBodySchema.parse({
        ...input,
        datasetId: input.datasetId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset tag create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/proApi/core/dataset/tag/create',
            payload: validatedBody
          }
        });
      }

      const res = await client.request({
        method: 'POST',
        path: '/proApi/core/dataset/tag/create',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Created tag "${validatedBody.tag}" in dataset "${validatedBody.datasetId}".`
      });
    },

    updateTag: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateDatasetCollectionTagBodySchema.parse({
        ...input,
        datasetId: input.datasetId?.trim(),
        tagId: input.tagId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset tag update',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/proApi/core/dataset/tag/update',
            payload: validatedBody
          }
        });
      }

      const res = await client.request({
        method: 'POST',
        path: '/proApi/core/dataset/tag/update',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Updated tag "${validatedBody.tagId}" to "${validatedBody.tag}".`
      });
    },

    deleteTag: async ({ client, datasetId, tagId, dryRun }) => {
      const validatedQuery = DeleteDatasetCollectionTagQuerySchema.parse({
        datasetId: datasetId?.trim(),
        id: tagId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset tag delete',
          risk: 'destructive',
          preview: {
            method: 'DELETE',
            path: '/proApi/core/dataset/tag/delete',
            query: validatedQuery
          }
        });
      }

      await client.request({
        method: 'DELETE',
        path: '/proApi/core/dataset/tag/delete',
        query: validatedQuery
      });

      return createChangedResult({
        data: { datasetId: validatedQuery.datasetId, tagId: validatedQuery.id, deleted: true },
        message: `Deleted tag "${validatedQuery.id}" from dataset "${validatedQuery.datasetId}".`
      });
    },

    setCollectionTags: async ({ client, input, dryRun }) => {
      const validatedBody = SetCollectionTagsBodySchema.parse({
        ...input,
        datasetId: input.datasetId?.trim(),
        collectionId: input.collectionId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset tag set',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/proApi/core/dataset/tag/setCollectionTags',
            payload: validatedBody
          }
        });
      }

      const res = await client.request({
        method: 'POST',
        path: '/proApi/core/dataset/tag/setCollectionTags',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Updated tags on collection "${validatedBody.collectionId}".`
      });
    },

    batchSetCollectionTags: async ({ client, input, dryRun }) => {
      const validatedBody = BatchSetCollectionTagsBodySchema.parse({
        ...input,
        datasetId: input.datasetId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset tag batch-set',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/proApi/core/dataset/tag/batchSetCollectionTags',
            payload: validatedBody
          }
        });
      }

      const res = await client.request({
        method: 'POST',
        path: '/proApi/core/dataset/tag/batchSetCollectionTags',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Batch updated tags on ${validatedBody.collectionIds.length} collection(s).`
      });
    },

    getSynonymDetail: async ({ client, datasetId }) => {
      const validatedQuery = GetDatasetSynonymDetailQuerySchema.parse({
        datasetId: datasetId?.trim()
      });
      const res = await client.request<GetDatasetSynonymDetailResponse>({
        method: 'GET',
        path: '/core/dataset/synonym/detail',
        query: validatedQuery
      });
      return createSuccessResult({ data: res });
    },

    searchSynonymMappings: async ({ client, datasetId, search, page, pageSize }) => {
      const validatedBody = SearchDatasetSynonymMappingsBodySchema.parse({
        datasetId: datasetId?.trim(),
        ...(search !== undefined ? { search } : {}),
        ...(page !== undefined ? { pageNum: page } : {}),
        ...(pageSize !== undefined ? { pageSize } : {})
      });

      const res = await client.request<SearchDatasetSynonymMappingsResponse>({
        method: 'POST',
        path: '/core/dataset/synonym/mappings',
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

    uploadSynonymMappings: async ({ client, input, dryRun }) => {
      const validatedBody = UploadDatasetSynonymBodySchema.parse({
        ...input,
        datasetId: input.datasetId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset synonym upload',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/synonym/upload',
            datasetId: validatedBody.datasetId,
            mappingsCount: validatedBody.mappings.length,
            fileName: validatedBody.fileName
          }
        });
      }

      const res = await client.request<DatasetSynonymMutationResponse>({
        method: 'POST',
        path: '/core/dataset/synonym/upload',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Uploaded ${validatedBody.mappings.length} synonym mapping(s) (version ${res.fileVersion}, affected chunks: ${res.affectedDataCount}).`
      });
    },

    uploadSynonymFile: async ({ client, datasetId, file, dryRun }) => {
      const validatedData = UploadDatasetSynonymFileBodySchema.parse({
        datasetId: datasetId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset synonym upload-file',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/synonym/uploadFile',
            contentType: 'multipart/form-data',
            file: { filename: file.filename, size: file.size, mimeType: file.mimeType },
            data: validatedData
          }
        });
      }

      const formData = new FormData();
      formData.append(
        'file',
        new Blob([Buffer.from(file.data)], { type: file.mimeType }),
        file.filename
      );
      formData.append('data', JSON.stringify(validatedData));

      const res = await client.uploadMultipart<DatasetSynonymMutationResponse>({
        path: '/core/dataset/synonym/uploadFile',
        formData,
        timeoutMs: LONG_OPERATION_TIMEOUT_MS
      });

      return createChangedResult({
        data: res,
        message: `Uploaded synonym file "${res.fileName}" (version ${res.fileVersion}, affected chunks: ${res.affectedDataCount}).`
      });
    },

    updateSynonymMappings: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateDatasetSynonymBodySchema.parse({
        ...input,
        datasetId: input.datasetId?.trim(),
        oldSynonymId: input.oldSynonymId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset synonym update',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/synonym/update',
            datasetId: validatedBody.datasetId,
            oldSynonymId: validatedBody.oldSynonymId,
            oldFileVersion: validatedBody.oldFileVersion,
            mappingsCount: validatedBody.mappings.length
          }
        });
      }

      const res = await client.request<DatasetSynonymMutationResponse>({
        method: 'POST',
        path: '/core/dataset/synonym/update',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Updated synonym mappings (new version ${res.fileVersion}, affected chunks: ${res.affectedDataCount}).`
      });
    },

    updateSynonymFile: async ({
      client,
      datasetId,
      oldSynonymId,
      oldFileVersion,
      file,
      dryRun
    }) => {
      const validatedData = UpdateDatasetSynonymFileBodySchema.parse({
        datasetId: datasetId?.trim(),
        oldSynonymId: oldSynonymId?.trim(),
        oldFileVersion
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset synonym update-file',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/synonym/updateFile',
            contentType: 'multipart/form-data',
            file: { filename: file.filename, size: file.size, mimeType: file.mimeType },
            data: validatedData
          }
        });
      }

      const formData = new FormData();
      formData.append(
        'file',
        new Blob([Buffer.from(file.data)], { type: file.mimeType }),
        file.filename
      );
      formData.append('data', JSON.stringify(validatedData));

      const res = await client.uploadMultipart<DatasetSynonymMutationResponse>({
        path: '/core/dataset/synonym/updateFile',
        formData,
        timeoutMs: LONG_OPERATION_TIMEOUT_MS
      });

      return createChangedResult({
        data: res,
        message: `Updated synonym file "${res.fileName}" (new version ${res.fileVersion}, affected chunks: ${res.affectedDataCount}).`
      });
    },

    deleteSynonym: async ({ client, synonymId, oldFileVersion, dryRun }) => {
      const validatedQuery = DeleteDatasetSynonymQuerySchema.parse({
        id: synonymId?.trim(),
        oldFileVersion
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset synonym delete',
          risk: 'destructive',
          preview: {
            method: 'DELETE',
            path: '/core/dataset/synonym/delete',
            query: validatedQuery
          }
        });
      }

      const res = await client.request<DeleteDatasetSynonymResponse>({
        method: 'DELETE',
        path: '/core/dataset/synonym/delete',
        query: validatedQuery
      });

      return createChangedResult({
        data: res,
        message: `Deleted synonym config "${validatedQuery.id}" (affected chunks: ${res.affectedDataCount}).`
      });
    },

    downloadSynonym: async ({ client, synonymId, writeOutput }) => {
      const validatedQuery = DownloadDatasetSynonymQuerySchema.parse({
        id: synonymId?.trim()
      });

      const rawResp = await client.requestRaw({
        method: 'GET',
        path: '/core/dataset/synonym/download',
        query: validatedQuery,
        timeoutMs: LONG_OPERATION_TIMEOUT_MS
      });

      const bytes = new Uint8Array(await rawResp.arrayBuffer());

      if (writeOutput) {
        const outputPath = await writeOutput(bytes);
        return createSuccessResult({
          data: { synonymId: validatedQuery.id, outputPath, bytes: bytes.byteLength },
          message: `Downloaded synonym CSV (${bytes.byteLength} bytes) to "${outputPath}".`
        });
      }

      return createSuccessResult({
        data: {
          synonymId: validatedQuery.id,
          bytes: bytes.byteLength,
          csv: new TextDecoder('utf-8').decode(bytes)
        },
        message: `Downloaded synonym CSV (${bytes.byteLength} bytes).`
      });
    }
  };
}
