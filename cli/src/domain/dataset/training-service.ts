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
import { buildPaginationMeta } from '../../shared/input';
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
    intervalMs?: number;
    timeoutMs?: number;
    failOnError?: boolean;
    sleepFn?: (ms: number) => Promise<void>;
    onProgress?: (msg: string) => void;
  }) => Promise<CliResult>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
      intervalMs = 2000,
      timeoutMs = 300_000,
      failOnError = true,
      sleepFn = defaultSleep,
      onProgress
    }) => {
      const validatedQuery = GetDatasetTrainingQueueQuerySchema.parse({
        datasetId: datasetId?.trim()
      });

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
        const queueRes = await client.request<GetDatasetTrainingQueueResponse>({
          method: 'GET',
          path: '/core/dataset/training/getDatasetTrainingQueue',
          query: validatedQuery
        });

        if (queueRes.hasTrainingTask !== lastState) {
          lastState = queueRes.hasTrainingTask;
          onProgress?.(
            queueRes.hasTrainingTask
              ? `Dataset "${validatedQuery.datasetId}" training in progress (poll #${polls})...`
              : `Dataset "${validatedQuery.datasetId}" training queue is now empty.`
          );
        }

        if (!queueRes.hasTrainingTask) {
          const errStatus = await client.request<HasDatasetTrainingErrorResponse>({
            method: 'GET',
            path: '/core/dataset/training/hasDatasetTrainingError',
            query: validatedQuery
          });

          if (errStatus.hasError && failOnError) {
            throw new CliApiError({
              message: `Training queue completed, but dataset "${validatedQuery.datasetId}" has training errors.`,
              httpStatus: 500,
              details: {
                datasetId: validatedQuery.datasetId,
                hasError: true,
                polls
              }
            });
          }

          return createSuccessResult({
            data: {
              datasetId: validatedQuery.datasetId,
              completed: true,
              hasError: errStatus.hasError,
              polls,
              elapsedMs: Date.now() - startAt
            },
            message: errStatus.hasError
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
