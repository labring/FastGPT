import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { authEvaluationDatasetRead } from '@fastgpt/service/core/evaluation/common';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  getEvalDatasetCollectionDetailQuery,
  getEvalDatasetCollectionDetailResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import {
  getCollectionStatus,
  buildCollectionAggregationPipeline,
  formatCollectionBase
} from '@fastgpt/service/core/evaluation/dataset/utils';

async function handler(
  req: ApiRequestProps<{}, getEvalDatasetCollectionDetailQuery>
): Promise<getEvalDatasetCollectionDetailResponse> {
  const { collectionId } = req.query;

  const { teamId } = await authEvaluationDatasetRead(collectionId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const collection = await MongoEvalDatasetCollection.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(collectionId),
        teamId: new Types.ObjectId(teamId)
      }
    },
    ...buildCollectionAggregationPipeline({ teamId: 1, tmbId: 1, metadata: 1 })
  ]);

  if (!collection || collection.length === 0) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  const collectionData = collection[0];
  const status = await getCollectionStatus(collectionId);

  return {
    teamId: String(collectionData.teamId),
    tmbId: String(collectionData.tmbId),
    metadata: collectionData.metadata || {},
    status,
    ...formatCollectionBase(collectionData)
  };
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
