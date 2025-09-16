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
  listFailedTasksResponse,
  getEvalDatasetCollectionDetailResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import type { SmartGenerateEvalDatasetResponse } from '@/pages/api/core/evaluation/dataset/data/smartGenerate';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

// 智能生成评测数据集
export const postSmartGenerateEvaluationDataset = (data: smartGenerateEvalDatasetBody) =>
  POST<SmartGenerateEvalDatasetResponse>('/core/evaluation/dataset/data/smartGenerate', data);

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
  POST<listFailedTasksResponse>('/core/evaluation/dataset/collection/failedTasks', data);

// 重试单个任务
export const postRetryEvaluationDatasetTask = (data: retryTaskBody) =>
  POST('/core/evaluation/dataset/collection/retryTask', data);

// 删除单个任务
export const deleteEvaluationDatasetTask = (data: deleteTaskBody) =>
  POST('/core/evaluation/dataset/collection/deleteTask', data);

// 获取评测数据集详情
export const getEvaluationDatasetCollectionDetail = (collectionId: string) =>
  GET<getEvalDatasetCollectionDetailResponse>(
    `/core/evaluation/dataset/collection/detail?collectionId=${collectionId}`
  );

// 获取评测数据集数据详情
export const getEvaluationDatasetDataDetail = (dataId: string) =>
  GET(`/core/evaluation/dataset/data/detail?dataId=${dataId}`);

// 批量重试所有任务
export const postRetryAllEvaluationDatasetTasks = (data: { collectionId: string }) =>
  POST('/core/evaluation/dataset/collection/retryAllTask', data);

// 上传文件
export const generateDataByUploadFile = ({
  fileList,
  percentListen,
  name,
  enableQualityEvaluation,
  evaluationModel,
  collectionId
}: {
  fileList: File[];
  percentListen: (percent: number) => void;
  collectionId: string;
  name?: string;
  enableQualityEvaluation: boolean;
  evaluationModel?: string;
}) => {
  const formData = new FormData();

  // 处理文件数组，为每个文件添加到 FormData
  fileList.forEach((singleFile, index) => {
    formData.append('file', singleFile, encodeURIComponent(singleFile.name));
  });

  const otherParams = {
    ...(name ? { name } : {}),
    ...(evaluationModel ? { evaluationModel } : {}),
    enableQualityEvaluation,
    collectionId
  };
  formData.append('data', JSON.stringify(otherParams));

  return POST(`/core/evaluation/dataset/data/import`, formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen?.(percent);
    },
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
};
