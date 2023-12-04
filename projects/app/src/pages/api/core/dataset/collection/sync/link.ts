import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { loadingOneChunkCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollectionRelevantData } from '@fastgpt/service/core/dataset/data/controller';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { urlsFetch } from '@fastgpt/global/common/file/tools';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { collectionId } = req.body as { collectionId: string };

    if (!collectionId) {
      throw new Error('CollectionIdId is required');
    }

    const { collection, tmbId } = await authDatasetCollection({
      req,
      authToken: true,
      collectionId,
      per: 'w'
    });

    if (collection.type !== DatasetCollectionTypeEnum.link || !collection.rawLink) {
      return Promise.reject(DatasetErrEnum.unLinkCollection);
    }

    // crawl new data
    const result = await urlsFetch({
      urlList: [collection.rawLink],
      selector: collection.datasetId?.websiteConfig?.selector
    });

    const rawText = result[0].content;
    if (!rawText) {
      return Promise.reject('Raw text is required');
    }

    // create a collection and delete old
    const id = await createOneCollection({
      teamId: collection.teamId,
      tmbId: collection.tmbId,
      name: collection.name,
      parentId: collection.parentId,
      datasetId: collection.datasetId._id,
      type: collection.type,
      trainingType: collection.trainingType,
      chunkSize: collection.chunkSize,
      fileId: collection.fileId,
      rawLink: collection.rawLink,
      metadata: collection.metadata
    });

    // start load
    await loadingOneChunkCollection({
      collectionId: id,
      tmbId,
      rawText
    });

    // delete old collection
    await Promise.all([
      delCollectionRelevantData({
        collectionIds: [collection._id],
        fileIds: collection.fileId ? [collection.fileId] : []
      }),
      MongoDatasetCollection.findByIdAndRemove(collection._id)
    ]);

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
