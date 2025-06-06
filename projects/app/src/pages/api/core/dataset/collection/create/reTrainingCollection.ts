import { type reTrainingDatasetFileCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/operationLog/util';

type RetrainingCollectionResponse = {
  collectionId: string;
};

// 获取集合并处理
async function handler(
  req: ApiRequestProps<reTrainingDatasetFileCollectionParams>
): Promise<RetrainingCollectionResponse> {
  const { collectionId, ...data } = req.body;

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: collectionId,
    per: WritePermissionVal
  });

  return mongoSessionRun(async (session) => {
    await delCollection({
      collections: [collection],
      session,
      delImg: false,
      delFile: false
    });

    const { collectionId } = await createCollectionAndInsertData({
      dataset: collection.dataset,
      relatedId: collection.metadata?.relatedImgId,
      createCollectionParams: {
        ...collection,
        ...data,
        updateTime: new Date()
      }
    });

    (async () => {
      addOperationLog({
        tmbId,
        teamId,
        event: OperationLogEventEnum.RETRAIN_COLLECTION,
        params: {
          collectionName: collection.name,
          datasetName: collection.dataset?.name || '',
          datasetType: getI18nDatasetType(collection.dataset?.type || '')
        }
      });
    })();

    return { collectionId };
  });
}

export default NextAPI(handler);
