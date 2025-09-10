import { DELETE, POST, GET } from '@/web/common/api/request';
import type {
  createEvalDatasetCollectionBody,
  smartGenerateEvalDatasetBody,
  listEvalDatasetCollectionBody,
  listEvalDatasetCollectionResponse,
  listEvalDatasetDataBody,
  listEvalDatasetDataResponse,
  createEvalDatasetDataBody,
  updateEvalDatasetDataBody,
  qualityAssessmentBody,
  qualityAssessmentBatchBody,
  qualityAssessmentBatchResponse,
  deleteEvalDatasetDataQuery,
  updateEvalDatasetCollectionBody,
  retryTaskBody,
  deleteTaskBody,
  listFailedTasksBody,
  listFailedTasksResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

// 智能生成评测数据集
export const postSmartGenerateEvaluationDataset = (data: smartGenerateEvalDatasetBody) =>
  POST('/core/evaluation/dataset/data/smartGenerate', data);

// 创建评测数据集
export const postCreateEvaluationDataset = (data: createEvalDatasetCollectionBody) =>
  POST<string>('/core/evaluation/dataset/collection/create', data);

// 获取评测数据集列表
export const getEvaluationDatasetList = (data: listEvalDatasetCollectionBody) =>
  POST<PaginationResponse<listEvalDatasetCollectionResponse>>(
    '/core/evaluation/dataset/collection/list',
    data
  );

// 删除评测数据集
export const deleteEvaluationDataset = (data: { collectionId: string }) =>
  DELETE('/core/evaluation/dataset/collection/delete', data);

// 更新评测数据集名称
export const updateEvaluationDataset = (data: updateEvalDatasetCollectionBody) =>
  POST('/core/evaluation/dataset/collection/update', data);

// 评测数据集文件导入
export const postImportEvaluationDatasetFile = (data: {
  fileId: string;
  collectionId: string;
  enableQualityEvaluation: boolean;
  evaluationModel?: string;
}) => POST('/core/evaluation/dataset/data/fileId', data);

// 评测数据集数据列表
export const getEvaluationDatasetDataList = (data: listEvalDatasetDataBody) =>
  POST<PaginationResponse<listEvalDatasetDataResponse>>('/core/evaluation/dataset/data/list', data);

// 手动新增数据到评测数据集
export const postCreateEvaluationDatasetData = (data: createEvalDatasetDataBody) =>
  POST('/core/evaluation/dataset/data/create', data);

// 智能生成从知识库中追加数据到评测数据集
export const postSmartGenerateEvaluationDatasetData = (data: smartGenerateEvalDatasetBody) =>
  POST('/core/evaluation/dataset/data/create/smartGenerate', data);

// 文件导入从文件上传追加数据到评测数据集
export const postImportEvaluationDatasetData = (data: any) =>
  POST('/core/evaluation/dataset/data/create/localFile', data);

// 编辑数据集数据
export const updateEvaluationDatasetData = (data: updateEvalDatasetDataBody) =>
  POST('/core/evaluation/dataset/data/update', data);

// 删除数据集数据
export const deleteEvaluationDatasetData = (data: deleteEvalDatasetDataQuery) =>
  DELETE('/core/evaluation/dataset/data/delete', data);

// 单项数据质量评估
export const postEvaluationDatasetQualityAssessment = (data: qualityAssessmentBody) =>
  POST('/core/evaluation/dataset/data/qualityAssessment', data);

// 批量数据质量评估
export const postEvaluationDatasetQualityAssessmentBatch = (data: qualityAssessmentBatchBody) =>
  POST<qualityAssessmentBatchResponse>(
    '/core/evaluation/dataset/collection/qualityAssessmentBatch',
    data
  );

// 获取异常任务详情
export const getEvaluationDatasetFailedTasks = (data: listFailedTasksBody) =>
  POST<PaginationResponse<listFailedTasksResponse>>(
    '/core/evaluation/dataset/collection/failedTasks',
    data
  );

// 重试单个任务
export const postRetryEvaluationDatasetTask = (data: retryTaskBody) =>
  POST('/core/evaluation/dataset/collection/retryTask', data);

// 删除单个任务
export const deleteEvaluationDatasetTask = (data: deleteTaskBody) =>
  POST('/core/evaluation/dataset/collection/deleteTask', data);

// 获取评测数据集数据详情
export const getEvaluationDatasetDataDetail = (dataId: string) =>
  GET(`/core/evaluation/dataset/data/detail?dataId=${dataId}`);
