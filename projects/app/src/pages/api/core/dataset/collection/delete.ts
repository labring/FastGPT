import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollectionAndRelatedSources } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { id: collectionId } = req.query as { id: string };

    if (!collectionId) {
      throw new Error('CollectionIdId is required');
    }

    const { teamId, collection } = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: 'w'
    });

    // find all delete id
    const collections = await findCollectionAndChild({
      teamId,
      datasetId: collection.datasetId._id,
      collectionId,
      fields: '_id teamId datasetId fileId metadata'
    });

    // delete
    await mongoSessionRun((session) =>
      delCollectionAndRelatedSources({
        collections,
        session
      })
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
