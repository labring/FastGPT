import { NextAPI } from '@/service/middleware/entry';
import { getDatasetCollections } from '@/web/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { upsertWebsiteSyncJobScheduler } from '@fastgpt/service/core/dataset/websiteSync';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  await mongoSessionRun(async (session) => {
    // find out all website dataset
    const datasets = await MongoDataset.find({ type: DatasetTypeEnum.websiteDataset }, undefined, {
      session
    });

    await Promise.all(
      datasets.flatMap((dataset) => {
        if (dataset.autoSync)
          return upsertWebsiteSyncJobScheduler({ datasetId: String(dataset._id) });
        else return [];
      })
    );

    // clear all collection next sync time
    for (const dataset of datasets) {
      await MongoDatasetCollection.updateMany(
        {
          teamId: dataset.teamId,
          datasetId: dataset._id
        },
        {
          $unset: {
            nextSyncTime: 1
          }
        },
        { session }
      );
    }
  });

  return { success: true };
}

export default NextAPI(handler);
