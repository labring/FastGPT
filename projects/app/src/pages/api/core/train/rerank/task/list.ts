import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { resolveRerankTasksByTunedModelId } from '@fastgpt/service/core/train/rerank/task/controller';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  ListRerankTrainTasksRequest,
  ListRerankTrainTasksResponse,
  RerankTrainTaskListItem
} from '@fastgpt/global/core/train/rerank/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';
import { buildRerankTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/rerank/task/utils';

/**
 * Chain traversal query by tunedModelId
 * Traverses the training task chain upward from the given tuned model ID
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainTasksResponse>
): Promise<ListRerankTrainTasksResponse> {
  const { baseModelId, tunedModelId, status } = req.body as ListRerankTrainTasksRequest;

  const { offset, pageSize } = parsePaginationRequest(req);
  const sort = parseSortParams(req, 'createTime', 'desc', [
    'createTime',
    'updateTime',
    'finishTime'
  ]);

  // Verify user team permission
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // Build query conditions
  const matchQuery: any = { teamId: new Types.ObjectId(teamId) };
  if (baseModelId) matchQuery.baseModelId = baseModelId;
  if (status) matchQuery.status = status;

  // If tunedModelId is provided, resolve the training task chain and use the task IDs
  let taskIds: string[] | undefined;
  if (tunedModelId) {
    const taskChain = await resolveRerankTasksByTunedModelId(tunedModelId, teamId);
    taskIds = taskChain.map((task) => task._id.toString());
    if (taskIds.length === 0) {
      // No tasks found for this tunedModelId
      return { list: [], total: 0 };
    }
    matchQuery._id = { $in: taskIds.map((id) => new Types.ObjectId(id)) };
  }

  // Query task list via aggregation pipeline
  const [tasks, total] = await Promise.all([
    MongoRerankTrainTask.aggregate([
      { $match: matchQuery },
      { $sort: sort },
      { $skip: offset },
      { $limit: pageSize },
      ...buildRerankTrainTaskAggregationPipeline()
    ]),
    MongoRerankTrainTask.countDocuments(matchQuery)
  ]);

  return { list: tasks, total };
}

export default NextAPI(handler);
