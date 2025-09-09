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
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { authEvaluationDatasetDataRead } from '@fastgpt/service/core/evaluation/common';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<listEvalDatasetDataBody, {}>
): Promise<listEvalDatasetDataResponse> {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { collectionId, searchKey } = req.body;

  if (!collectionId) {
    throw new Error('Collection ID is required');
  }

  await authEvaluationDatasetDataRead(collectionId, {
    req,
    authToken: true,
    authApiKey: true
  });

  const match: Record<string, any> = {
    datasetId: new Types.ObjectId(collectionId)
  };

  if (searchKey && typeof searchKey === 'string' && searchKey.trim().length > 0) {
    const searchRegex = new RegExp(`${replaceRegChars(searchKey.trim())}`, 'i');
    match.$or = [
      { [EvalDatasetDataKeyEnum.UserInput]: { $regex: searchRegex } },
      { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: searchRegex } },
      { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: searchRegex } }
    ];
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
        metadata: item.metadata || {},
        createFrom: item.createFrom,
        createTime: item.createTime,
        updateTime: item.updateTime
      }))
    };
  } catch (error) {
    addLog.error('Database error in eval dataset data list', {
      collectionId,
      searchKey,
      offset,
      pageSize,
      error
    });
    throw error;
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
      metadata: 1,
      createFrom: 1,
      createTime: 1,
      updateTime: 1
    }
  }
];

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
