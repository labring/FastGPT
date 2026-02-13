import type { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { addDatasetDeleteJob } from '@fastgpt/service/core/dataset/delete';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { deleteDatasetsImmediate } from '@fastgpt/service/core/dataset/delete/processor';

async function handler(req: NextApiRequest) {
  const { id: datasetId } = req.query as {
    id: string;
  };

  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // auth owner
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  const deleteDatasets = await findDatasetAndAllChildren({
    teamId,
    datasetId,
    fields: '_id'
  });
  const datasetIds = deleteDatasets.map((d) => d._id);

  await mongoSessionRun(async (session) => {
    // 1. Mark as deleted
    await MongoDataset.updateMany(
      {
        _id: datasetIds,
        teamId
      },
      {
        deleteTime: new Date()
      },
      {
        session
      }
    );

    await deleteDatasetsImmediate({
      teamId,
      datasetIds
    });

    // 2. Add to delete queue
    await addDatasetDeleteJob({
      teamId,
      datasetId
    });
  });

  // 3. Add audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_DATASET,
      params: {
        datasetName: dataset.name,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
}

export default NextAPI(handler);
