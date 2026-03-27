import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import type {
  ListRerankTrainsetsRequest,
  ListRerankTrainsetsResponse
} from '@fastgpt/global/core/train/rerank/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainsetsResponse>
): Promise<ListRerankTrainsetsResponse> {
  const { status } = req.body as ListRerankTrainsetsRequest;

  const { offset, pageSize } = parsePaginationRequest(req);
  const sort = parseSortParams(req, 'createTime', 'desc', ['createTime', 'updateTime', 'name']);

  // Authenticate user team permission
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // Filter by teamId (no longer relies on appId)
  const query: any = { teamId };
  if (status) query.status = status;

  // Query trainset list with pagination
  const [trainsets, total] = await Promise.all([
    MongoRerankTrainset.find(query).sort(sort).skip(offset).limit(pageSize).lean(),
    MongoRerankTrainset.countDocuments(query)
  ]);

  return { list: trainsets, total };
}

export default NextAPI(handler);
