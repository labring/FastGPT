import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type { ListAllEmbeddingTrainTasksResponse } from '@fastgpt/global/core/train/embedding/api';
import { buildEmbeddingTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/embedding/task/utils';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListAllEmbeddingTrainTasksResponse>
): Promise<ListAllEmbeddingTrainTasksResponse> {
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const tasks = await MongoEmbeddingTrainTask.aggregate([
    { $match: { teamId: new Types.ObjectId(teamId) } },
    { $sort: { createTime: -1 } },
    ...buildEmbeddingTrainTaskAggregationPipeline()
  ]);

  return tasks as ListAllEmbeddingTrainTasksResponse;
}

export default NextAPI(handler);
