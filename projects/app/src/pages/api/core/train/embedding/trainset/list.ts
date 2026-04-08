import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEmbeddingTrainset } from '@fastgpt/service/core/train/embedding/trainset/schema';
import type {
  ListEmbeddingTrainsetsRequest,
  ListEmbeddingTrainsetsResponse
} from '@fastgpt/global/core/train/embedding/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListEmbeddingTrainsetsResponse>
): Promise<ListEmbeddingTrainsetsResponse> {
  const { status } = req.body as ListEmbeddingTrainsetsRequest;

  const { offset, pageSize } = parsePaginationRequest(req);
  const sort = parseSortParams(req, 'createTime', 'desc', ['createTime', 'updateTime', 'name']);

  // Authenticate user team permission
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // Filter by teamId
  const query: any = { teamId };
  if (status) query.status = status;

  // Query trainset list with pagination
  const [trainsets, total] = await Promise.all([
    MongoEmbeddingTrainset.find(query).sort(sort).skip(offset).limit(pageSize).lean(),
    MongoEmbeddingTrainset.countDocuments(query)
  ]);

  return { list: trainsets, total };
}

export default NextAPI(handler);
