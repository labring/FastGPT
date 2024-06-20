import type { NextApiRequest } from 'next';
import type { GetDatasetDataListProps } from '@/global/core/api/datasetReq';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest) {
  let {
    pageNum = 1,
    pageSize = 10,
    searchText = '',
    collectionId
  } = req.body as GetDatasetDataListProps;

  pageSize = Math.min(pageSize, 30);

  // 凭证校验
  const { teamId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  searchText = replaceRegChars(searchText).replace(/'/g, '');

  const match = {
    teamId,
    datasetId: collection.datasetId._id,
    collectionId,
    ...(searchText
      ? {
          $or: [{ q: new RegExp(searchText, 'i') }, { a: new RegExp(searchText, 'i') }]
        }
      : {})
  };

  const [data, total] = await Promise.all([
    MongoDatasetData.find(match, '_id datasetId collectionId q a chunkIndex')
      .sort({ chunkIndex: 1, updateTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MongoDatasetData.countDocuments(match)
  ]);

  return {
    pageNum,
    pageSize,
    data,
    total
  };
}

export default NextAPI(handler);
