import type { NextApiRequest, NextApiResponse } from 'next';
import type { AddTagsToCollectionsParams } from '@fastgpt/global/core/dataset/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { collectionIds, tag, datasetId } = req.body as AddTagsToCollectionsParams;

  if (!collectionIds || !tag) {
    return res.status(400).json({ error: 'missingParams' });
  }

  // 验证权限
  for (const collectionId of collectionIds) {
    await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: WritePermissionVal
    });
  }

  // 查询并更新 collections
  try {
    const allCollections = await MongoDatasetCollection.find({ datasetId });

    for (const collection of allCollections) {
      if (!collection.tags?.includes(tag) && collectionIds.includes(collection._id.toString())) {
        collection.tags?.push(tag);
      } else if (
        collection.tags?.includes(tag) &&
        !collectionIds.includes(collection._id.toString())
      ) {
        collection.tags = collection.tags.filter((t) => t !== tag);
      }
    }

    // 保存更新后的 collections
    await Promise.all(allCollections.map((collection) => collection.save()));

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'internalServerError', details: error.message });
  }
}

export default NextAPI(handler);
