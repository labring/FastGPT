import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import {
  getCollectionAndRawText,
  reloadCollectionChunks
} from '@fastgpt/service/core/dataset/collection/utils';
import { delCollectionAndRelatedSources } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

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
    const agentModelData = getLLMModel(collection.datasetId.agentModel);

    await mongoSessionRun(async (session) => {
      // create training bill
      const { billId } = await createTrainingUsage({
        teamId: collection.teamId,
        tmbId,
        appName: 'core.dataset.collection.Sync Collection',
        billSource: UsageSourceEnum.training,
        vectorModel: vectorModelData.name,
        agentModel: agentModelData.name,
        session
      });

      // create a collection and delete old
      const newCol = await createOneCollection({
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
        createTime: collection.createTime,
        session
      });

      // start load
      await reloadCollectionChunks({
        collection: {
          ...newCol.toObject(),
          datasetId: collection.datasetId
        },
        tmbId,
        billId,
        rawText,
        session
      });

      // delete old collection
      await delCollectionAndRelatedSources({
        collections: [collection],
        session
      });
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
