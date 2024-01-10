import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import {
  getCollectionAndRawText,
  reloadCollectionChunks
} from '@fastgpt/service/core/dataset/collection/utils';
import { delCollectionRelevantData } from '@fastgpt/service/core/dataset/data/controller';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { createTrainingBill } from '@fastgpt/service/support/wallet/bill/controller';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { getQAModel, getVectorModel } from '@/service/core/ai/model';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';

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

    const { title, rawText, isSameRawText } = await getCollectionAndRawText({
      collection
    });

    if (isSameRawText) {
      return jsonRes(res, {
        data: DatasetCollectionSyncResultEnum.sameRaw
      });
    }

    /* Not the same original text, create and reload */

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
    const _id = await createOneCollection({
      teamId: collection.teamId,
      tmbId: collection.tmbId,
      parentId: collection.parentId,
      datasetId: collection.datasetId._id,
      name: title || collection.name,
      type: collection.type,
      trainingType: collection.trainingType,
      chunkSize: collection.chunkSize,
      fileId: collection.fileId,
      rawLink: collection.rawLink,
      metadata: collection.metadata,
      createTime: collection.createTime
    });

    // start load
    await reloadCollectionChunks({
      collectionId: _id,
      tmbId,
      billId,
      rawText
    });

    // delete old collection
    await delCollectionRelevantData({
      collectionIds: [collection._id],
      fileIds: collection.fileId ? [collection.fileId] : []
    });

    jsonRes(res, {
      data: DatasetCollectionSyncResultEnum.success
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
