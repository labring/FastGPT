import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  ListRerankTrainTasksRequest,
  ListRerankTrainTasksResponse
} from '@fastgpt/global/core/train/rerank/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';
import { buildTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/rerank/task/utils';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainTasksResponse>
): Promise<ListRerankTrainTasksResponse> {
  const { appId, status } = req.body as ListRerankTrainTasksRequest;

  const { offset, pageSize } = parsePaginationRequest(req);
  const sort = parseSortParams(req, 'createTime', 'desc', [
    'createTime',
    'updateTime',
    'finishTime'
  ]);

  // Authenticate user team permission
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  // Build query conditions
  const matchQuery: any = { teamId: new Types.ObjectId(teamId) };
  if (appId) matchQuery.appId = new Types.ObjectId(appId);
  if (status) matchQuery.status = status;

  // Query task list using aggregation pipeline
  const [tasks, total] = await Promise.all([
    MongoRerankTrainTask.aggregate([
      { $match: matchQuery },
      { $sort: sort },
      { $skip: offset },
      { $limit: pageSize },
      ...buildTrainTaskAggregationPipeline()
    ]),
    MongoRerankTrainTask.countDocuments(matchQuery)
  ]);

  return { list: tasks, total };
}

export default NextAPI(handler);
