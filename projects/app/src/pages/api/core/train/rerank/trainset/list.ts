import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type {
  ListRerankTrainsetsRequest,
  ListRerankTrainsetsResponse
} from '@fastgpt/global/core/train/rerank/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainsetsResponse>
): Promise<ListRerankTrainsetsResponse> {
  const { appId, status } = req.body as ListRerankTrainsetsRequest;

  const { offset, pageSize } = parsePaginationRequest(req);
  const sort = parseSortParams(req, 'createTime', 'desc', ['createTime', 'updateTime', 'name']);

  // Authenticate user team permission
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  // Build query conditions
  const query: any = { teamId };
  if (appId) query.appId = appId;
  if (status) query.status = status;

  // Query trainset list
  const [trainsets, total] = await Promise.all([
    MongoRerankTrainset.find(query).sort(sort).skip(offset).limit(pageSize).lean(),
    MongoRerankTrainset.countDocuments(query)
  ]);

  // Get app info
  const appIds = [...new Set(trainsets.map((t) => String(t.appId)))];
  const apps = await MongoApp.find({ _id: { $in: appIds } })
    .select('_id name avatar')
    .lean();

  const appMap = new Map(apps.map((app) => [String(app._id), app]));

  // Assemble return data
  const list = trainsets.map((trainset) => {
    const app = appMap.get(String(trainset.appId));
    return {
      ...trainset,
      appName: app?.name || '',
      appAvatar: app?.avatar || ''
    };
  });

  return { list, total };
}

export default NextAPI(handler);
