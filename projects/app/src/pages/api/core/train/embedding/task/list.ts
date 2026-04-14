import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  ListEmbeddingTrainTasksRequest,
  ListEmbeddingTrainTasksResponse,
  EmbeddingTrainTaskListItem
} from '@fastgpt/global/core/train/embedding/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';
import { buildEmbeddingTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/embedding/task/utils';
import { resolveEmbeddingTasksByTunedModelId } from '@fastgpt/service/core/train/embedding/task/controller';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListEmbeddingTrainTasksResponse>
): Promise<ListEmbeddingTrainTasksResponse> {
  const { baseModelId, status, tunedModelId } = req.body as ListEmbeddingTrainTasksRequest;

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
    const taskChain = await resolveEmbeddingTasksByTunedModelId(tunedModelId, teamId);
    taskIds = taskChain.map((task) => task._id.toString());
    if (taskIds.length === 0) {
      // No tasks found for this tunedModelId
      return { list: [], total: 0 };
    }
    matchQuery._id = { $in: taskIds.map((id) => new Types.ObjectId(id)) };
  }

  // Query task list via aggregation pipeline
  const [tasks, total] = await Promise.all([
    MongoEmbeddingTrainTask.aggregate([
      { $match: matchQuery },
      { $sort: sort },
      { $skip: offset },
      { $limit: pageSize },
      ...buildEmbeddingTrainTaskAggregationPipeline()
    ]),
    MongoEmbeddingTrainTask.countDocuments(matchQuery)
  ]);

  return { list: tasks as EmbeddingTrainTaskListItem[], total };
}

export default NextAPI(handler);
