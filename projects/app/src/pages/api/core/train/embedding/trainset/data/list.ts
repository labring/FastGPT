import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainset } from '@fastgpt/service/support/permission/train/embedding/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEmbeddingTrainsetData } from '@fastgpt/service/core/train/embedding/data/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  ListEmbeddingTrainDataRequest,
  ListEmbeddingTrainDataResponse
} from '@fastgpt/global/core/train/embedding/api';
import { parsePaginationRequest, parseSortParams } from '@fastgpt/service/common/api/pagination';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListEmbeddingTrainDataResponse>
): Promise<ListEmbeddingTrainDataResponse> {
  const { trainsetId, source } = req.body as ListEmbeddingTrainDataRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { offset, pageSize } = parsePaginationRequest(req);
  const sort = parseSortParams(req, 'createTime', 'desc', ['createTime', 'updateTime']);

  await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: ReadPermissionVal
  });

  const query: any = {
    trainsetId: new Types.ObjectId(trainsetId)
  };
  if (source) query.source = source;

  const [list, total] = await Promise.all([
    MongoEmbeddingTrainsetData.find(query).sort(sort).skip(offset).limit(pageSize).lean(),
    MongoEmbeddingTrainsetData.countDocuments(query)
  ]);

  return { list, total };
}

export default NextAPI(handler);
