import type { NextApiRequest } from 'next';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type.d';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

/* get all dataset tags by datasetId */
async function handler(req: NextApiRequest): Promise<PaginationResponse<DatasetTagType>> {
  const { datasetId, searchText, pageSize, current } = req.body as PaginationProps<{
    datasetId: string;
    searchText?: string;
  }>;
  // 分页查询
  const query = {
    datasetId,
    tag: { $regex: searchText || '', $options: 'i' }
  };
  const total = await MongoDatasetCollectionTags.countDocuments(query);
  const list = await MongoDatasetCollectionTags.find(query)
    .sort({ _id: -1 })
    .skip((current - 1) * pageSize)
    .limit(pageSize);
  return {
    total,
    list
  };
}

export default NextAPI(handler);
