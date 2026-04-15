import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type { ListAllRerankTrainTasksResponse } from '@fastgpt/global/core/train/rerank/api';
import { buildRerankTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/rerank/task/utils';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListAllRerankTrainTasksResponse>
): Promise<ListAllRerankTrainTasksResponse> {
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const tasks = await MongoRerankTrainTask.aggregate([
    { $match: { teamId: new Types.ObjectId(teamId) } },
    { $sort: { createTime: -1 } },
    ...buildRerankTrainTaskAggregationPipeline()
  ]);

  return tasks as ListAllRerankTrainTasksResponse;
}

export default NextAPI(handler);
