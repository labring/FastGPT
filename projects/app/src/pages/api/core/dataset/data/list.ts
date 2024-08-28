import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { PagingData, RequestPaging } from '@/types';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { DatasetDataListItemType } from '@/global/core/dataset/type';

export type GetDatasetDataListProps = RequestPaging & {
  searchText?: string;
  collectionId: string;
};

async function handler(
  req: ApiRequestProps<GetDatasetDataListProps>
): Promise<PagingData<DatasetDataListItemType>> {
  let { pageNum = 1, pageSize = 10, searchText = '', collectionId } = req.body;

  pageSize = Math.min(pageSize, 30);

  // 凭证校验
  const { teamId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const queryReg = new RegExp(`${replaceRegChars(searchText)}`, 'i');
  const match = {
    teamId,
    datasetId: collection.datasetId._id,
    collectionId,
    ...(searchText.trim()
      ? {
          $or: [{ q: queryReg }, { a: queryReg }]
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
