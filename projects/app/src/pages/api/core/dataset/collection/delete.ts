import type { NextApiRequest } from 'next';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/operationLog/util';

async function handler(req: NextApiRequest) {
  const { id: collectionId } = req.query as { id: string };

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId, collection, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  // find all delete id
  const collections = await findCollectionAndChild({
    teamId,
    datasetId: collection.datasetId,
    collectionId,
    fields: '_id teamId datasetId fileId metadata'
  });

  // delete
  await mongoSessionRun((session) =>
    delCollection({
      collections,
      delImg: true,
      delFile: true,
      session
    })
  );

  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.DELETE_COLLECTION,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();
}

export default NextAPI(handler);
