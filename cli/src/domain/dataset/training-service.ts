import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  GetCollectionTrainingDetailResponseType,
  ListCollectionV2ResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  DeleteTrainingDataBodySchema,
  GetDatasetTrainingErrorBodySchema,
  GetDatasetTrainingQueueQuerySchema,
  GetTrainingDataDetailBodySchema,
  GetTrainingErrorBodySchema,
  HasDatasetTrainingErrorQuerySchema,
  RebuildEmbeddingBodySchema,
  UpdateTrainingDataBodySchema,
  type DeleteTrainingDataBody,
  type GetDatasetTrainingErrorBody,
  type GetDatasetTrainingErrorResponse,
  type GetDatasetTrainingQueueResponse,
  type GetTrainingDataDetailBody,
  type GetTrainingDataDetailResponse,
  type GetTrainingErrorBody,
  type GetTrainingErrorResponse,
  type HasDatasetTrainingErrorResponse,
  type RebuildEmbeddingBody,
  type UpdateTrainingDataBody
} from '@fastgpt/global/openapi/core/dataset/training/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliApiError, CliArgumentError } from '../../shared/errors';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type TrainingErrorsParams = Pick<GetDatasetTrainingErrorBody, 'datasetId'> &
  Partial<Omit<GetDatasetTrainingErrorBody, 'datasetId'>> & {
    page?: number;
  };

export type CollectionTrainingErrorsParams = Pick<GetTrainingErrorBody, 'collectionId'> &
  Partial<Omit<GetTrainingErrorBody, 'collectionId'>> & {
    page?: number;
  };

export type DatasetTrainingService = {
  getQueue: (params: {
    client: FastGptHttpClient;
    datasetId: string;
  }) => Promise<CliResult<GetDatasetTrainingQueueResponse>>;
  hasError: (params: {
    client: FastGptHttpClient;
    datasetId: string;
  }) => Promise<CliResult<HasDatasetTrainingErrorResponse>>;
  getDatasetErrors: (params: {
    client: FastGptHttpClient;
    input: TrainingErrorsParams;
  }) => Promise<CliResult<GetDatasetTrainingErrorResponse>>;
  getCollectionErrors: (params: {
    client: FastGptHttpClient;
    input: CollectionTrainingErrorsParams;
  }) => Promise<CliResult<GetTrainingErrorResponse>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    input: GetTrainingDataDetailBody;
  }) => Promise<CliResult<GetTrainingDataDetailResponse>>;
  retryOrUpdate: (params: {
    client: FastGptHttpClient;
    input: UpdateTrainingDataBody;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  deleteTrainingData: (params: {
    client: FastGptHttpClient;
    input: DeleteTrainingDataBody;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  rebuildEmbedding: (params: {
    client: FastGptHttpClient;
    input: RebuildEmbeddingBody;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  wait: (params: {
    client: FastGptHttpClient;
    datasetId: string;
    collectionId?: string;
    intervalMs?: number;
    timeoutMs?: number;
    failOnError?: boolean;
    sleepFn?: (ms: number) => Promise<void>;
    onProgress?: (msg: string) => void;
  }) => Promise<CliResult>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const sumValues = (record: Record<string, number> | undefined): number =>
  record
    ? Object.values(record).reduce((sum, val) => sum + (Number.isFinite(val) ? val : 0), 0)
    : 0;

/**
 * 通过集合树统计知识库当前的活跃训练数与最终失败数，区分「仍在运行」与「仅剩最终失败记录」。
 * （因服务端 `getDatasetTrainingQueue` 将最终失败任务与失败重建均计入 `hasTrainingTask: true`）
 */
async function inspectDatasetTrainingState({
  client,
  datasetId,
  collectionId
}: {
  client: FastGptHttpClient;
  datasetId: string;
  collectionId?: string;
}): Promise<{
  isActive: boolean;
  hasError: boolean;
  activeCount: number;
  errorCount: number;
}> {
  if (collectionId) {
    const detail = await client.request<GetCollectionTrainingDetailResponseType>({
      method: 'GET',
      path: '/core/dataset/collection/trainingDetail',
      query: { collectionId }
    });
    const activeCount = sumValues(detail.queuedCounts) + sumValues(detail.trainingCounts);
    const errorCount = sumValues(detail.errorCounts);
    return {
      isActive: activeCount > 0,
      hasError: errorCount > 0,
      activeCount,
      errorCount
    };
  }

  const queueRes = await client.request<GetDatasetTrainingQueueResponse>({
    method: 'GET',
    path: '/core/dataset/training/getDatasetTrainingQueue',
    query: { datasetId }
  });

  if (!queueRes.hasTrainingTask) {
    const errStatus = await client.request<HasDatasetTrainingErrorResponse>({
      method: 'GET',
      path: '/core/dataset/training/hasDatasetTrainingError',
      query: { datasetId }
    });
    return {
      isActive: false,
      hasError: errStatus.hasError,
      activeCount: 0,
      errorCount: errStatus.hasError ? 1 : 0
    };
  }

  // `hasTrainingTask` 为 true 时，并行检查最终错误标志与集合级活跃/失败统计以区分卡住的最终失败
  const [errStatus, rootPage] = await Promise.all([
    client.request<HasDatasetTrainingErrorResponse>({
      method: 'GET',
      path: '/core/dataset/training/hasDatasetTrainingError',
      query: { datasetId }
    }),
    client
      .request<ListCollectionV2ResponseType>({
        method: 'POST',
        path: '/core/dataset/collection/listV2',
        body: { datasetId, parentId: null, pageNum: 1, pageSize: 100, simple: false }
      })
      .catch(() => undefined)
  ]);

  if (rootPage && Array.isArray(rootPage.list) && rootPage.list.length > 0) {
    const allItems = [...rootPage.list];
    const folderQueue: string[] = rootPage.list
      .filter((item) => item.type === DatasetCollectionTypeEnum.folder)
      .map((item) => item._id);

    // 若根目录未覆盖全部分页，继续拉取剩余根目录页
    for (let pageNum = 2; allItems.length < rootPage.total && pageNum <= 20; pageNum += 1) {
      const nextPage = await client
        .request<ListCollectionV2ResponseType>({
          method: 'POST',
          path: '/core/dataset/collection/listV2',
          body: { datasetId, parentId: null, pageNum, pageSize: 100, simple: false }
        })
        .catch(() => undefined);
      if (!nextPage || nextPage.list.length === 0) break;
      allItems.push(...nextPage.list);
      for (const item of nextPage.list) {
        if (item.type === DatasetCollectionTypeEnum.folder) {
          folderQueue.push(item._id);
        }
      }
    }

    // 遍历子文件夹中的集合（带安全上限防止深树过载）
    const visitedFolders = new Set<string>();
    while (folderQueue.length > 0 && visitedFolders.size < 50) {
      const folderId = folderQueue.shift()!;
      if (visitedFolders.has(folderId)) continue;
      visitedFolders.add(folderId);
      const subPage = await client
        .request<ListCollectionV2ResponseType>({
          method: 'POST',
          path: '/core/dataset/collection/listV2',
          body: { datasetId, parentId: folderId, pageNum: 1, pageSize: 100, simple: false }
        })
        .catch(() => undefined);
      if (!subPage) continue;
      allItems.push(...subPage.list);
      for (const item of subPage.list) {
        if (item.type === DatasetCollectionTypeEnum.folder && !visitedFolders.has(item._id)) {
          folderQueue.push(item._id);
        }
      }
    }

    const activeCount = allItems.reduce((sum, item) => sum + (item.activeTrainingAmount ?? 0), 0);
    const errorCount = allItems.reduce((sum, item) => sum + (item.finalErrorAmount ?? 0), 0);
    return {
      isActive: activeCount > 0,
      hasError: errStatus.hasError || errorCount > 0,
      activeCount,
      errorCount
    };
  }

  // 若列表为空（如测试 mock 未提供 collection/listV2），依据 hasError 区分最终失败与活跃任务
  if (errStatus.hasError) {
    return { isActive: false, hasError: true, activeCount: 0, errorCount: 1 };
  }
  return { isActive: true, hasError: false, activeCount: 1, errorCount: 0 };
}

/**
 * 知识库训练队列监控、重试与等待编排服务（PRD-02.3）。
 */
export function createDatasetTrainingService(): DatasetTrainingService {
  return {
    getQueue: async ({ client, datasetId }) => {
      const validatedQuery = GetDatasetTrainingQueueQuerySchema.parse({
        datasetId: datasetId?.trim()
      });

      const res = await client.request<GetDatasetTrainingQueueResponse>({
        method: 'GET',
        path: '/core/dataset/training/getDatasetTrainingQueue',
        query: validatedQuery
      });

      return createSuccessResult({
        data: res,
        message: res.hasTrainingTask
          ? `Dataset "${validatedQuery.datasetId}" has active training tasks.`
          : `Dataset "${validatedQuery.datasetId}" training queue is idle.`
      });
    },

    hasError: async ({ client, datasetId }) => {
      const validatedQuery = HasDatasetTrainingErrorQuerySchema.parse({
        datasetId: datasetId?.trim()
      });

      const res = await client.request<HasDatasetTrainingErrorResponse>({
        method: 'GET',
        path: '/core/dataset/training/hasDatasetTrainingError',
        query: validatedQuery
      });

      return createSuccessResult({ data: res });
    },

    getDatasetErrors: async ({ client, input }) => {
      const { page, ...rest } = input;
      const validatedBody = GetDatasetTrainingErrorBodySchema.parse({
        ...rest,
        datasetId: input.datasetId?.trim(),
        ...(input.collectionId !== undefined ? { collectionId: input.collectionId.trim() } : {}),
        ...(page !== undefined ? { pageNum: page } : {})
      });

      const res = await client.request<GetDatasetTrainingErrorResponse>({
        method: 'POST',
        path: '/core/dataset/training/getDatasetTrainingError',
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

    getCollectionErrors: async ({ client, input }) => {
      const { page, ...rest } = input;
      const validatedBody = GetTrainingErrorBodySchema.parse({
        ...rest,
        collectionId: input.collectionId?.trim(),
        ...(page !== undefined ? { pageNum: page } : {})
      });

      const res = await client.request<GetTrainingErrorResponse>({
        method: 'POST',
        path: '/core/dataset/training/getTrainingError',
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

    getDetail: async ({ client, input }) => {
      const validatedBody = GetTrainingDataDetailBodySchema.parse({
        collectionId: input.collectionId?.trim(),
        dataId: input.dataId?.trim()
      });

      const res = await client.request<GetTrainingDataDetailResponse>({
        method: 'POST',
        path: '/core/dataset/training/getTrainingDataDetail',
        body: validatedBody
      });

      return createSuccessResult({ data: res });
    },

    retryOrUpdate: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateTrainingDataBodySchema.parse(input);

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset train retry',
          risk: 'write',
          preview: {
            method: 'PUT',
            path: '/core/dataset/training/updateTrainingData',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'PUT',
        path: '/core/dataset/training/updateTrainingData',
        body: validatedBody
      });

      return createChangedResult({
        data: { retried: true, target: validatedBody },
        message: 'Training retry / update triggered successfully.'
      });
    },

    deleteTrainingData: async ({ client, input, dryRun }) => {
      const validatedBody = DeleteTrainingDataBodySchema.parse({
        collectionId: input.collectionId?.trim(),
        dataId: input.dataId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset train delete',
          risk: 'destructive',
          preview: {
            method: 'POST',
            path: '/core/dataset/training/deleteTrainingData',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/core/dataset/training/deleteTrainingData',
        body: validatedBody
      });

      return createChangedResult({
        data: { ...validatedBody, deleted: true },
        message: `Deleted training task "${validatedBody.dataId}".`
      });
    },

    rebuildEmbedding: async ({ client, input, dryRun }) => {
      const validatedBody = RebuildEmbeddingBodySchema.parse({
        datasetId: input.datasetId?.trim(),
        vectorModelId: input.vectorModelId?.trim()
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'dataset train rebuild',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/dataset/training/rebuildEmbedding',
            payload: validatedBody
          }
        });
      }

      await client.request({
        method: 'POST',
        path: '/core/dataset/training/rebuildEmbedding',
        body: validatedBody
      });

      return createChangedResult({
        data: { ...validatedBody, rebuilding: true },
        message: `Rebuilding vector embeddings for dataset "${validatedBody.datasetId}" with model "${validatedBody.vectorModelId}".`
      });
    },

    wait: async ({
      client,
      datasetId,
      collectionId,
      intervalMs = 2000,
      timeoutMs = 300_000,
      failOnError = true,
      sleepFn = defaultSleep,
      onProgress
    }) => {
      const validatedQuery = GetDatasetTrainingQueueQuerySchema.parse({
        datasetId: trimIfString(datasetId)
      });
      const trimmedCollectionId = trimIfString(collectionId);

      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new CliArgumentError(
          '--interval must be a positive finite number (in milliseconds).'
        );
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new CliArgumentError('--timeout must be a positive finite number (in milliseconds).');
      }

      const startAt = Date.now();
      let lastState: boolean | undefined;
      let polls = 0;

      while (true) {
        polls += 1;
        const state = await inspectDatasetTrainingState({
          client,
          datasetId: validatedQuery.datasetId,
          collectionId: trimmedCollectionId
        });

        if (state.isActive !== lastState) {
          lastState = state.isActive;
          onProgress?.(
            state.isActive
              ? `Dataset "${validatedQuery.datasetId}" training in progress (poll #${polls}, active=${state.activeCount})...`
              : `Dataset "${validatedQuery.datasetId}" active training queue is now empty.`
          );
        }

        if (!state.isActive) {
          if (state.hasError && failOnError) {
            throw new CliApiError({
              message: `Training completed with errors for dataset "${validatedQuery.datasetId}" (errorCount=${state.errorCount}).`,
              httpStatus: 500,
              details: {
                datasetId: validatedQuery.datasetId,
                ...(trimmedCollectionId ? { collectionId: trimmedCollectionId } : {}),
                hasError: true,
                errorCount: state.errorCount,
                polls
              }
            });
          }

          return createSuccessResult({
            data: {
              datasetId: validatedQuery.datasetId,
              ...(trimmedCollectionId ? { collectionId: trimmedCollectionId } : {}),
              completed: true,
              hasError: state.hasError,
              errorCount: state.errorCount,
              polls,
              elapsedMs: Date.now() - startAt
            },
            message: state.hasError
              ? `Training completed with errors for dataset "${validatedQuery.datasetId}".`
              : `Training completed cleanly for dataset "${validatedQuery.datasetId}".`
          });
        }

        if (Date.now() - startAt >= timeoutMs) {
          throw new CliApiError({
            message: `Timed out after ${timeoutMs}ms waiting for dataset "${validatedQuery.datasetId}" training queue to drain.`,
            httpStatus: 408,
            details: {
              datasetId: validatedQuery.datasetId,
              polls,
              timeoutMs
            }
          });
        }

        await sleepFn(intervalMs);
      }
    }
  };
}
