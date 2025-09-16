import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  listEvalDatasetDataBody,
  listEvalDatasetDataResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { EvalDatasetDataQualityResultEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultValues
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { authEvaluationDatasetDataRead } from '@fastgpt/service/core/evaluation/common';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<listEvalDatasetDataBody, {}>
): Promise<listEvalDatasetDataResponse> {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { collectionId, searchKey, status: qualityStatus, qualityResult } = req.body;

  if (!collectionId) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionIdRequired);
  }
  if (
    qualityStatus &&
    !Object.values(EvalDatasetDataQualityStatusEnum).includes(
      qualityStatus as EvalDatasetDataQualityStatusEnum
    )
  ) {
    return Promise.reject(EvaluationErrEnum.evalDataQualityStatusInvalid);
  }
  if (
    qualityResult &&
    !EvalDatasetDataQualityResultValues.includes(qualityResult as EvalDatasetDataQualityResultEnum)
  ) {
    return Promise.reject(EvaluationErrEnum.evalDataQualityStatusInvalid);
  }

  await authEvaluationDatasetDataRead(collectionId, {
    req,
    authToken: true,
    authApiKey: true
  });

  const match: Record<string, any> = {
    evalDatasetCollectionId: new Types.ObjectId(collectionId)
  };

  if (searchKey && typeof searchKey === 'string' && searchKey.trim().length > 0) {
    const searchRegex = new RegExp(`${replaceRegChars(searchKey.trim())}`, 'i');
    match.$or = [
      { [EvalDatasetDataKeyEnum.UserInput]: { $regex: searchRegex } },
      { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: searchRegex } },
      { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: searchRegex } }
    ];
  }

  if (qualityStatus && typeof qualityStatus === 'string' && qualityStatus.trim().length > 0) {
    match['qualityMetadata.status'] = qualityStatus.trim();
  }

  if (qualityResult && typeof qualityResult === 'string' && qualityResult.trim().length > 0) {
    match['qualityResult'] = qualityResult.trim();
  }

  try {
    const [dataList, total] = await Promise.all([
      MongoEvalDatasetData.aggregate(buildPipeline(match, offset, pageSize)),
      MongoEvalDatasetData.countDocuments(match)
    ]);

    return {
      total,
      list: dataList.map((item) => ({
        _id: String(item._id),
        [EvalDatasetDataKeyEnum.UserInput]: item.userInput,
        [EvalDatasetDataKeyEnum.ActualOutput]: item.actualOutput || '',
        [EvalDatasetDataKeyEnum.ExpectedOutput]: item.expectedOutput,
        [EvalDatasetDataKeyEnum.Context]: item.context || [],
        [EvalDatasetDataKeyEnum.RetrievalContext]: item.retrievalContext || [],
        qualityMetadata: item.qualityMetadata || {
          status: EvalDatasetDataQualityStatusEnum.unevaluated
        },
        synthesisMetadata: item.synthesisMetadata || {},
        qualityResult: item.qualityResult,
        createFrom: item.createFrom,
        createTime: item.createTime,
        updateTime: item.updateTime
      }))
    };
  } catch (error) {
    addLog.error('Failed to list evaluation dataset data', {
      collectionId,
      searchKey,
      qualityStatus,
      qualityResult,
      offset,
      pageSize,
      error
    });
    return Promise.reject(EvaluationErrEnum.evalDatasetDataListError);
  }
}

/**
 * Build MongoDB aggregation pipeline
 */
const buildPipeline = (match: Record<string, any>, offset: number, pageSize: number) => [
  { $match: match },
  { $sort: { createTime: -1 as const } },
  { $skip: offset },
  { $limit: pageSize },
  {
    $project: {
      _id: 1,
      [EvalDatasetDataKeyEnum.UserInput]: 1,
      [EvalDatasetDataKeyEnum.ActualOutput]: 1,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: 1,
      [EvalDatasetDataKeyEnum.Context]: 1,
      [EvalDatasetDataKeyEnum.RetrievalContext]: 1,
      qualityMetadata: 1,
      synthesisMetadata: 1,
      qualityResult: 1,
      createFrom: 1,
      createTime: 1,
      updateTime: 1
    }
  }
];

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
