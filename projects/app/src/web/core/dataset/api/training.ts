import { GET, POST, PUT } from '@/web/common/api/request';
import type {
  RebuildEmbeddingBody,
  GetDatasetTrainingQueueResponse,
  DeleteTrainingDataBody,
  UpdateTrainingDataBody,
  GetTrainingDataDetailBody,
  GetTrainingDataDetailResponse,
  GetTrainingErrorBody,
  GetTrainingErrorResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

export const postRebuildEmbedding = (data: RebuildEmbeddingBody) =>
  POST(`/core/dataset/training/rebuildEmbedding`, data);

export const getDatasetTrainingQueue = (datasetId: string) =>
  GET<GetDatasetTrainingQueueResponse>(`/core/dataset/training/getDatasetTrainingQueue`, {
    datasetId
  });

export const deleteTrainingData = (data: DeleteTrainingDataBody) =>
  POST(`/core/dataset/training/deleteTrainingData`, data);

export const updateTrainingData = (data: UpdateTrainingDataBody) =>
  PUT(`/core/dataset/training/updateTrainingData`, data);

export const getTrainingDataDetail = (data: GetTrainingDataDetailBody) =>
  POST<GetTrainingDataDetailResponse>(`/core/dataset/training/getTrainingDataDetail`, data);

export const getTrainingError = (data: GetTrainingErrorBody) =>
  POST<GetTrainingErrorResponse>(`/core/dataset/training/getTrainingError`, data);
