import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollectionRelevantData } from '@fastgpt/service/core/dataset/data/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { id: collectionId } = req.query as { id: string };

    if (!collectionId) {
      throw new Error('CollectionIdId is required');
    }

    await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: 'w'
    });

    // find all delete id
    const collections = await findCollectionAndChild(collectionId, '_id fileId');
    const delIdList = collections.map((item) => item._id);

    // delete
    await delCollectionRelevantData({
      collectionIds: delIdList,
      fileIds: collections.map((item) => item?.fileId || '').filter(Boolean)
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
