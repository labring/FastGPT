import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { loadingOneChunkCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollectionRelevantData } from '@fastgpt/service/core/dataset/data/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { createTrainingBill } from '@fastgpt/service/support/wallet/bill/controller';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { getQAModel, getVectorModel } from '@/service/core/ai/model';

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

    const vectorModelData = getVectorModel(collection.datasetId.vectorModel);
    const agentModelData = getQAModel(collection.datasetId.agentModel);
    // create training bill
    const { billId } = await createTrainingBill({
      teamId: collection.teamId,
      tmbId,
      appName: 'core.dataset.collection.Sync Collection',
      billSource: BillSourceEnum.training,
      vectorModel: vectorModelData.name,
      agentModel: agentModelData.name
    });

    // create a collection and delete old
    const { _id } = await MongoDatasetCollection.create({
      parentId: collection.parentId,
      teamId: collection.teamId,
      tmbId: collection.tmbId,
      datasetId: collection.datasetId._id,
      type: collection.type,
      name: collection.name,
      createTime: collection.createTime,
      trainingType: collection.trainingType,
      chunkSize: collection.chunkSize,
      fileId: collection.fileId,
      rawLink: collection.rawLink,
      metadata: collection.metadata
    });

    // start load
    await loadingOneChunkCollection({
      collectionId: _id,
      tmbId,
      billId
    });

    // delete old collection
    await delCollectionRelevantData({
      collectionIds: [collection._id],
      fileIds: collection.fileId ? [collection.fileId] : []
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
