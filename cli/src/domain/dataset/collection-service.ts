import {
  DeleteCollectionBodySchema,
  ExportCollectionBodySchema,
  GetCollectionDetailQuerySchema,
  GetCollectionPathsQuerySchema,
  GetCollectionTrainingDetailQuerySchema,
  GetTagFilterOptionsQuerySchema,
  ListCollectionV2BodySchema,
  ReadCollectionSourceBodySchema,
  SyncCollectionBodySchema,
  UpdateDatasetCollectionBodySchema,
  type GetCollectionDetailResponseType,
  type GetCollectionPathsResponseType,
  type GetCollectionTrainingDetailResponseType,
  type GetTagFilterOptionsResponseType,
  type ListCollectionV2BodyType,
  type ListCollectionV2ResponseType,
  type ReadCollectionSourceResponseType,
  type SyncCollectionResponseType,
  type UpdateDatasetCollectionBodyType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  CreateCollectionBodySchema,
  CreateCollectionByFileIdBodySchema,
  CreateCollectionByLocalFileBodySchema,
  CreateLinkCollectionBodySchema,
  CreateTextCollectionBodySchema,
  ReTrainingCollectionBodySchema,
  type CreateCollectionBodyType,
  type CreateCollectionByFileIdBodyType,
  type CreateCollectionByLocalFileBodyType,
  type CreateCollectionWithResultResponseType,
  type CreateLinkCollectionBodyType,
  type CreateTextCollectionBodyType,
  type ReTrainingCollectionBodyType,
  type ReTrainingCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import {
  PresignDatasetFilePostUrlBodySchema,
  type PresignDatasetFilePostUrlResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';
import type { LoadedBinaryFile } from '../../infra/fs/file-io';
import {
  LONG_OPERATION_TIMEOUT_MS,
  type FastGptHttpClient
} from '../../infra/http/fastgpt-http-client';
import { CliApiError, CliNetworkError } from '../../shared/errors';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { redactText } from '../../shared/redact';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliFetchFn, CliResult } from '../../shared/types';

export type CollectionListParams = Pick<ListCollectionV2BodyType, 'datasetId'> &
  Partial<Omit<ListCollectionV2BodyType, 'datasetId'>> & {
    page?: number;
  };

export type CollectionCreateParams = CreateCollectionBodyType;
export type CollectionCreateTextParams = CreateTextCollectionBodyType;
export type CollectionCreateLinkParams = CreateLinkCollectionBodyType;
export type CollectionCreateLocalFileParams = CreateCollectionByLocalFileBodyType;
export type CollectionCreateByFileIdParams = CreateCollectionByFileIdBodyType;
export type CollectionUpdateParams = UpdateDatasetCollectionBodyType;
export type CollectionRetrainParams = ReTrainingCollectionBodyType;

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
  createByPresignedFile: (params: {
    client: FastGptHttpClient;
    fetchFn: CliFetchFn;
    file: LoadedBinaryFile;
    input: Omit<CollectionCreateByFileIdParams, 'fileId'>;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  createByFileId: (params: {
    client: FastGptHttpClient;
    input: CollectionCreateByFileIdParams;
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
  readSource: (params: {
    client: FastGptHttpClient;
    collectionId: string;
  }) => Promise<CliResult<ReadCollectionSourceResponseType>>;
  exportData: (params: {
    client: FastGptHttpClient;
    collectionId: string;
    writeOutput?: (data: Uint8Array) => Promise<string>;
    writeStreamOutput?: (
      stream: ReadableStream<Uint8Array>
    ) => Promise<{ path: string; bytes: number }>;
  }) => Promise<CliResult>;
  sync: (params: {
    client: FastGptHttpClient;
    collectionId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  retrain: (params: {
    client: FastGptHttpClient;
    input: CollectionRetrainParams;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  paths: (params: {
    client: FastGptHttpClient;
    sourceId?: string;
    type?: 'current' | 'parent';
  }) => Promise<CliResult<GetCollectionPathsResponseType>>;
  trainingDetail: (params: {
    client: FastGptHttpClient;
    collectionId: string;
  }) => Promise<CliResult<GetCollectionTrainingDetailResponseType>>;
  tagFilterOptions: (params: {
    client: FastGptHttpClient;
    datasetId: string;
  }) => Promise<CliResult<GetTagFilterOptionsResponseType>>;
};

/**
 * 知识库集合领域服务（PRD-02.2）：涵盖集合查询、多源创建（文本/网页/本地文件/S3 预签名上传）、更新、删除、重训与导出。
 */
export function createDatasetCollectionService(): DatasetCollectionService {
  return {
    list: async ({ client, input }) => {
      const { page, ...rest } = input;
      const rawBody = {
        ...rest,
        datasetId: input.datasetId?.trim(),
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
      const validatedQuery = GetCollectionDetailQuerySchema.parse({ id: collectionId?.trim() });

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
        datasetId: input.datasetId?.trim(),
        name: input.name?.trim()
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
        datasetId: input.datasetId?.trim(),
        link: input.link?.trim()
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

    createByPresignedFile: async ({ client, fetchFn, file, input, dryRun }) => {
      const presignBody = PresignDatasetFilePostUrlBodySchema.parse({
        filename: file.filename,
        datasetId: input.datasetId?.trim(),
        size: file.size > 0 ? file.size : undefined
      });
      const previewCreateBody = CreateCollectionByFileIdBodySchema.parse({
        ...input,
        datasetId: presignBody.datasetId,
        fileId: `<presigned-key:${file.filename}>`
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection create-file (presign)',
          risk: 'write',
          preview: {
            steps: [
              {
                method: 'POST',
                path: '/core/dataset/file/presignDatasetFilePostUrl',
                body: presignBody
              },
              {
                method: 'PUT',
                target: '<external-s3-presigned-url>',
                headersExcluded: ['token', 'authorization']
              },
              {
                method: 'POST',
                path: '/core/dataset/collection/create/fileId',
                body: previewCreateBody
              }
            ]
          }
        });
      }

      // 1. 申请预签名上传 URL
      const presigned = await client.request<PresignDatasetFilePostUrlResponse>({
        method: 'POST',
        path: '/core/dataset/file/presignDatasetFilePostUrl',
        body: presignBody
      });

      const baseWithSlash = client.baseUrl.endsWith('/') ? client.baseUrl : `${client.baseUrl}/`;
      const sendPresignRequest = async ({
        method,
        targetUrl,
        headers = {},
        body,
        signal
      }: {
        method: 'POST' | 'PUT';
        targetUrl: string;
        headers?: Record<string, string>;
        body?: BodyInit | null;
        signal?: AbortSignal;
      }): Promise<Response> => {
        const fullUrl = new URL(targetUrl, baseWithSlash).toString();
        const resp = await (async (): Promise<Response> => {
          if (client.requestExternal) {
            return client.requestExternal({
              method,
              url: fullUrl,
              headers,
              body,
              signal,
              timeoutMs: LONG_OPERATION_TIMEOUT_MS
            });
          }
          try {
            return await fetchFn(fullUrl, {
              method,
              headers,
              ...(body !== undefined && body !== null ? { body } : {}),
              ...(signal ? { signal } : {})
            });
          } catch (error) {
            const msg = redactText(error instanceof Error ? error.message : String(error));
            throw new CliNetworkError(
              `Direct ${method} upload failed for "${file.filename}": ${msg}`
            );
          }
        })();

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new CliApiError({
            message: `Direct ${method} request failed with HTTP ${resp.status}${errText ? `: ${redactText(errText.slice(0, 200))}` : ''}`,
            httpStatus: resp.status
          });
        }
        return resp;
      };

      if (presigned.uploadMode === 'single') {
        // 2. 直传预签名 URL：使用完整 URL + 共享 TLS 传输层，严格剥离 FastGPT 凭据头
        await sendPresignRequest({
          method: 'PUT',
          targetUrl: presigned.url,
          headers: {
            ...presigned.headers,
            'content-type': presigned.headers['content-type'] ?? file.mimeType
          },
          body: Buffer.from(file.data)
        });
      } else {
        // Multipart 分片上传：使用完整返回 URL（保留部署子路径与独立文件域）、受限并发、失败立即中止其他分片并最佳努力 abort 会话
        const partSize = presigned.partSize;
        const totalParts = Math.max(1, Math.ceil(file.data.byteLength / partSize));
        const concurrency = Math.max(1, Math.min(presigned.concurrency || 3, totalParts));
        const maxRetry = Math.max(0, presigned.maxRetry ?? 3);
        const abortController = new AbortController();

        const uploadSinglePart = async (
          partNumber: number
        ): Promise<{ partNumber: number; etag: string }> => {
          const start = (partNumber - 1) * partSize;
          const end = Math.min(start + partSize, file.data.byteLength);
          const chunk = file.data.slice(start, end);

          const partUrl = new URL(presigned.url, baseWithSlash);
          partUrl.searchParams.set('partNumber', String(partNumber));

          let lastError: unknown;
          for (let attempt = 0; attempt <= maxRetry; attempt += 1) {
            if (abortController.signal.aborted) {
              throw lastError ?? new CliNetworkError(`Upload aborted before part ${partNumber}.`);
            }
            try {
              const partRes = await sendPresignRequest({
                method: 'PUT',
                targetUrl: partUrl.toString(),
                headers: presigned.headers,
                body: Buffer.from(chunk),
                signal: abortController.signal
              });
              const partJson = JSON.parse(await partRes.text()) as {
                data?: { etag?: string };
                etag?: string;
              };
              const etag = partJson.data?.etag ?? partJson.etag;
              if (!etag) {
                throw new CliApiError({
                  message: `Multipart upload part ${partNumber} did not return an ETag.`,
                  httpStatus: 500
                });
              }
              return { partNumber, etag };
            } catch (error) {
              lastError = error;
              if (abortController.signal.aborted) {
                break;
              }
            }
          }
          throw lastError;
        };

        const results: Array<{ partNumber: number; etag: string }> = new Array(totalParts);
        let nextPart = 1;
        let firstFailure: unknown;
        const worker = async () => {
          while (!firstFailure && nextPart <= totalParts) {
            const current = nextPart;
            nextPart += 1;
            try {
              results[current - 1] = await uploadSinglePart(current);
            } catch (error) {
              if (!firstFailure) {
                firstFailure = error;
                abortController.abort(error);
              }
              break;
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        if (firstFailure) {
          // 最佳努力清理远端 Multipart 会话，保留原始错误抛出
          await sendPresignRequest({
            method: 'POST',
            targetUrl: presigned.abortUrl,
            headers: presigned.headers
          }).catch(() => {});
          throw firstFailure;
        }

        await sendPresignRequest({
          method: 'POST',
          targetUrl: presigned.completeUrl,
          headers: {
            ...presigned.headers,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ parts: results })
        });
      }

      // 3. 绑定文件 key 创建集合
      const createBody = CreateCollectionByFileIdBodySchema.parse({
        ...input,
        datasetId: presignBody.datasetId,
        fileId: presigned.key
      });

      const res = await client.request<CreateCollectionWithResultResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/create/fileId',
        body: createBody
      });

      return createChangedResult({
        data: { ...res, fileId: presigned.key },
        message: `File "${file.filename}" uploaded via presign (key: ${presigned.key}) and collection created (ID: ${res.collectionId}).`
      });
    },

    createByFileId: async ({ client, input, dryRun }) => {
      const validatedBody = CreateCollectionByFileIdBodySchema.parse({
        ...input,
        datasetId: trimIfString(input.datasetId),
        fileId: trimIfString(input.fileId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection create-file-id',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/create/fileId',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<CreateCollectionWithResultResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/create/fileId',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Collection created from fileId "${validatedBody.fileId}" (ID: ${res.collectionId}).`
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
        data: {
          ...(validatedBody.id ? { collectionId: validatedBody.id } : {}),
          updated: true
        },
        message: `Collection updated successfully.`
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
        message: `Collection(s) deleted successfully.`
      });
    },

    readSource: async ({ client, collectionId }) => {
      const validatedBody = ReadCollectionSourceBodySchema.parse({
        collectionId: collectionId?.trim()
      });

      const res = await client.request<ReadCollectionSourceResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/read',
        body: validatedBody
      });

      return createSuccessResult({ data: res });
    },

    exportData: async ({ client, collectionId, writeOutput, writeStreamOutput }) => {
      const validatedBody = ExportCollectionBodySchema.parse({
        collectionId: collectionId?.trim()
      });

      const rawResp = await client.requestRaw({
        method: 'POST',
        path: '/core/dataset/collection/export',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validatedBody),
        timeoutMs: LONG_OPERATION_TIMEOUT_MS
      });

      if (writeStreamOutput && rawResp.body) {
        const written = await writeStreamOutput(rawResp.body);
        return createSuccessResult({
          data: {
            collectionId: validatedBody.collectionId,
            outputPath: written.path,
            bytes: written.bytes
          },
          message: `Exported collection "${validatedBody.collectionId}" (${written.bytes} bytes) to "${written.path}".`
        });
      }

      const bytes = new Uint8Array(await rawResp.arrayBuffer());

      if (writeOutput) {
        const outputPath = await writeOutput(bytes);
        return createSuccessResult({
          data: {
            collectionId: validatedBody.collectionId,
            outputPath,
            bytes: bytes.byteLength
          },
          message: `Exported collection "${validatedBody.collectionId}" (${bytes.byteLength} bytes) to "${outputPath}".`
        });
      }

      return createSuccessResult({
        data: {
          collectionId: validatedBody.collectionId,
          bytes: bytes.byteLength,
          csv: new TextDecoder('utf-8').decode(bytes)
        },
        message: `Exported collection "${validatedBody.collectionId}" (${bytes.byteLength} bytes).`
      });
    },

    sync: async ({ client, collectionId, dryRun }) => {
      const validatedBody = SyncCollectionBodySchema.parse({
        collectionId: collectionId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection sync',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/sync',
            payload: validatedBody
          }
        });
      }

      const status = await client.request<SyncCollectionResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/sync',
        body: validatedBody
      });

      return createChangedResult({
        data: { collectionId: validatedBody.collectionId, syncStatus: status },
        message: `Collection "${validatedBody.collectionId}" sync completed with status: ${status}.`
      });
    },

    retrain: async ({ client, input, dryRun }) => {
      const validatedBody = ReTrainingCollectionBodySchema.parse({
        ...input,
        collectionId: input.collectionId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset collection retrain',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/collection/create/reTrainingCollection',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<ReTrainingCollectionResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/create/reTrainingCollection',
        body: validatedBody
      });

      return createChangedResult({
        data: res,
        message: `Collection retrain triggered (new collection ID: ${res.collectionId}).`
      });
    },

    paths: async ({ client, sourceId, type = 'current' }) => {
      const validatedQuery = GetCollectionPathsQuerySchema.parse({
        ...(sourceId ? { sourceId: sourceId.trim() } : {}),
        type
      });

      const res = await client.request<GetCollectionPathsResponseType>({
        method: 'GET',
        path: '/core/dataset/collection/paths',
        query: {
          ...(validatedQuery.sourceId ? { sourceId: validatedQuery.sourceId } : {}),
          ...(validatedQuery.type ? { type: validatedQuery.type } : {})
        }
      });

      return createSuccessResult({ data: res });
    },

    trainingDetail: async ({ client, collectionId }) => {
      const validatedQuery = GetCollectionTrainingDetailQuerySchema.parse({
        collectionId: collectionId?.trim()
      });

      const res = await client.request<GetCollectionTrainingDetailResponseType>({
        method: 'GET',
        path: '/core/dataset/collection/trainingDetail',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
    },

    tagFilterOptions: async ({ client, datasetId }) => {
      const validatedQuery = GetTagFilterOptionsQuerySchema.parse({
        datasetId: datasetId?.trim()
      });

      const res = await client.request<GetTagFilterOptionsResponseType>({
        method: 'GET',
        path: '/core/dataset/collection/tagFilterOptions',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
    }
  };
}
