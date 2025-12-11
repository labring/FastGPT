import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  ListRerankTrainDataRequest,
  ListRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainDataResponse>
): Promise<ListRerankTrainDataResponse> {
  const { trainsetId, source } = req.body as ListRerankTrainDataRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { offset, pageSize } = parsePaginationRequest(req);
  const sort = parseSortParams(req, 'createTime', 'desc', ['createTime', 'updateTime']);

  const { trainset } = await authRerankTrainset({
    req,
    authToken: true,
    trainsetId,
    per: ReadPermissionVal
  });

  const query: any = {
    trainsetId: new Types.ObjectId(trainsetId)
  };
  if (source) query.source = source;

  const [list, total] = await Promise.all([
    MongoRerankTrainsetData.find(query).sort(sort).skip(offset).limit(pageSize).lean(),
    MongoRerankTrainsetData.countDocuments(query)
  ]);

  return { list, total };
}

export default NextAPI(handler);
