import {
  DeleteCollectionBodySchema,
  GetCollectionDetailQuerySchema,
  ListCollectionV2BodySchema,
  UpdateDatasetCollectionBodySchema,
  type GetCollectionDetailResponseType,
  type ListCollectionV2BodyType,
  type ListCollectionV2ResponseType,
  type UpdateDatasetCollectionBodyType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  CreateCollectionBodySchema,
  CreateCollectionByLocalFileBodySchema,
  CreateLinkCollectionBodySchema,
  CreateTextCollectionBodySchema,
  type CreateCollectionBodyType,
  type CreateCollectionByLocalFileBodyType,
  type CreateCollectionWithResultResponseType,
  type CreateLinkCollectionBodyType,
  type CreateTextCollectionBodyType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import type { LoadedBinaryFile } from '../../infra/fs/file-io';
import {
  LONG_OPERATION_TIMEOUT_MS,
  type FastGptHttpClient
} from '../../infra/http/fastgpt-http-client';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type CollectionListParams = Pick<ListCollectionV2BodyType, 'datasetId'> &
  Partial<Omit<ListCollectionV2BodyType, 'datasetId'>> & {
    page?: number;
  };

export type CollectionCreateParams = CreateCollectionBodyType;
export type CollectionCreateTextParams = CreateTextCollectionBodyType;
export type CollectionCreateLinkParams = CreateLinkCollectionBodyType;
export type CollectionCreateLocalFileParams = CreateCollectionByLocalFileBodyType;
export type CollectionUpdateParams = UpdateDatasetCollectionBodyType;

export type CollectionDeleteTarget =
  | { id: string }
  | { collectionIds: string[] }
  | { datasetId: string; apiFileIds: string[] };

export type DatasetCollectionService = {
  list: (params: {
    client: FastGptHttpClient;
    input: CollectionListParams;
  }) => Promise<CliResult<ListCollectionV2ResponseType>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    collectionId: string;
  }) => Promise<CliResult<GetCollectionDetailResponseType>>;
  create: (params: {
    client: FastGptHttpClient;
    input: CollectionCreateParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  createText: (params: {
    client: FastGptHttpClient;
    input: CollectionCreateTextParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  createLink: (params: {
    client: FastGptHttpClient;
    input: CollectionCreateLinkParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  createLocalFile: (params: {
    client: FastGptHttpClient;
    file: LoadedBinaryFile;
    input: CollectionCreateLocalFileParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  update: (params: {
    client: FastGptHttpClient;
    input: CollectionUpdateParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  delete: (params: {
    client: FastGptHttpClient;
    target: CollectionDeleteTarget;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * 知识库集合领域服务：仅封装 System OpenAPI 标准接口（列表、详情、空集合/文本/链接/直接本地文件上传、更新、删除）。
 */
export function createDatasetCollectionService(): DatasetCollectionService {
  return {
    list: async ({ client, input }) => {
      const { page, ...rest } = input;
      const rawBody = {
        ...rest,
        datasetId: trimIfString(input.datasetId),
        ...(page !== undefined ? { pageNum: page } : {})
      };

      const validatedBody = ListCollectionV2BodySchema.parse(rawBody);

      const res = await client.request<ListCollectionV2ResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/listV2',
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

    getDetail: async ({ client, collectionId }) => {
      const validatedQuery = GetCollectionDetailQuerySchema.parse({
        id: trimIfString(collectionId)
      });

      const res = await client.request<GetCollectionDetailResponseType>({
        method: 'GET',
        path: '/core/dataset/collection/detail',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
    },

    create: async ({ client, input, dryRun }) => {
      const validatedBody = CreateCollectionBodySchema.parse({
        ...input,
        datasetId: trimIfString(input.datasetId),
        name: trimIfString(input.name)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/create',
            payload: validatedBody
          }
        });
      }

      const collectionId = await client.request<string>({
        method: 'POST',
        path: '/core/dataset/collection/create',
        body: validatedBody
      });

      return createChangedResult({
        data: { collectionId, name: validatedBody.name, type: validatedBody.type },
        message: `Collection "${validatedBody.name}" (${validatedBody.type}) created (ID: ${collectionId}).`
      });
    },

    createText: async ({ client, input, dryRun }) => {
      const validatedBody = CreateTextCollectionBodySchema.parse({
        ...input,
        datasetId: trimIfString(input.datasetId),
        name: trimIfString(input.name)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection create-text',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/create/text',
            payload: {
              ...validatedBody,
              text:
                validatedBody.text.length > 200
                  ? `${validatedBody.text.slice(0, 200)}... (${validatedBody.text.length} chars)`
                  : validatedBody.text
            }
          }
        });
      }

      const res = await client.request<CreateCollectionWithResultResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/create/text',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Text collection "${validatedBody.name}" created (ID: ${res.collectionId}, inserted: ${res.results.insertLen}).`
      });
    },

    createLink: async ({ client, input, dryRun }) => {
      const validatedBody = CreateLinkCollectionBodySchema.parse({
        ...input,
        datasetId: trimIfString(input.datasetId),
        link: trimIfString(input.link)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection create-link',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/create/link',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<CreateCollectionWithResultResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/create/link',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Link collection created from "${validatedBody.link}" (ID: ${res.collectionId}, inserted: ${res.results.insertLen}).`
      });
    },

    createLocalFile: async ({ client, file, input, dryRun }) => {
      const validatedBody = CreateCollectionByLocalFileBodySchema.parse({
        ...input,
        datasetId: trimIfString(input.datasetId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection create-file',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/create/localFile',
            contentType: 'multipart/form-data',
            file: {
              filename: file.filename,
              size: file.size,
              mimeType: file.mimeType
            },
            data: validatedBody
          }
        });
      }

      const formData = new FormData();
      const blob = new Blob([Buffer.from(file.data)], { type: file.mimeType });
      formData.append('file', blob, file.filename);
      formData.append('data', JSON.stringify(validatedBody));

      const res = await client.uploadMultipart<CreateCollectionWithResultResponseType>({
        path: '/core/dataset/collection/create/localFile',
        formData,
        timeoutMs: LONG_OPERATION_TIMEOUT_MS
      });

      return createChangedResult({
        data: res,
        message: `Local file "${file.filename}" uploaded and collection created (ID: ${res.collectionId}, inserted: ${res.results.insertLen}).`
      });
    },

    update: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateDatasetCollectionBodySchema.parse(input);

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection update',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/update',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/core/dataset/collection/update',
        body: validatedBody
      });

      return createChangedResult({
        data: { updated: true, target: validatedBody },
        message: 'Collection updated successfully.'
      });
    },

    delete: async ({ client, target, dryRun }) => {
      const validatedBody = DeleteCollectionBodySchema.parse(target);

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection delete',
          risk: 'destructive',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/delete',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/core/dataset/collection/delete',
        body: validatedBody
      });

      return createChangedResult({
        data: { deleted: true, target: validatedBody },
        message: 'Collection(s) deleted successfully.'
      });
    }
  };
}
