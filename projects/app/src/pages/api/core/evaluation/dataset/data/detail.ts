import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import type {
  getEvalDatasetDataDetailQuery,
  getEvalDatasetDataDetailResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { authEvaluationDatasetDataReadById } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<{}, getEvalDatasetDataDetailQuery>
): Promise<getEvalDatasetDataDetailResponse> {
  const { dataId } = req.query;

  if (!dataId || typeof dataId !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetDataIdRequired);
  }

  await authEvaluationDatasetDataReadById(dataId, {
    req,
    authToken: true,
    authApiKey: true
  });

  const dataItem = await MongoEvalDatasetData.findById(dataId).lean();

  if (!dataItem) {
    return Promise.reject(EvaluationErrEnum.datasetDataNotFound);
  }

  return {
    _id: String(dataItem._id),
    teamId: String(dataItem.teamId),
    tmbId: String(dataItem.tmbId),
    datasetId: String(dataItem.datasetId),
    [EvalDatasetDataKeyEnum.UserInput]: dataItem.userInput,
    [EvalDatasetDataKeyEnum.ActualOutput]: dataItem.actualOutput || '',
    [EvalDatasetDataKeyEnum.ExpectedOutput]: dataItem.expectedOutput,
    [EvalDatasetDataKeyEnum.Context]: dataItem.context || [],
    [EvalDatasetDataKeyEnum.RetrievalContext]: dataItem.retrievalContext || [],
    [EvalDatasetDataKeyEnum.Metadata]: dataItem.metadata || {},
    createFrom: dataItem.createFrom,
    createTime: dataItem.createTime,
    updateTime: dataItem.updateTime
  };
}

export default NextAPI(handler);
