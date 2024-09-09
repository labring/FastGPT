import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { AddTagsToCollectionsParams } from '@fastgpt/global/core/dataset/api';

/* 设置数据集合标签 */
async function handler(req: NextApiRequest): Promise<void> {
  const { collectionIds, datasetId, tag } = req.body as AddTagsToCollectionsParams;
  // 先创建标签如果没有的话
  const existTag = await MongoDatasetCollectionTags.findOne({ datasetId, tag }).lean();
  let tagId = '';
  if (!existTag) {
    const { _id } = await MongoDatasetCollectionTags.create({ datasetId, tag });
    tagId = _id;
  } else {
    tagId = existTag._id;
  }

  // 将标签转为标签id进行集合标签添加
  const tagIds = [tagId];
}

export default NextAPI(handler);
