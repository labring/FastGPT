import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import {
  ReTrainingCollectionBodySchema,
  ReTrainingCollectionResponseSchema,
  type ReTrainingCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

async function handler(req: ApiRequestProps): Promise<ReTrainingCollectionResponseType> {
  const { collectionId: inputCollectionId, ...data } = ReTrainingCollectionBodySchema.parse(
    req.body
  );

  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: inputCollectionId,
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
      createCollectionParams: {
        ...collection,
        ...data,
        parentId: collection.parentId ?? undefined,
        updateTime: new Date(),
        tags: await collectionTagsToTagLabel({
          datasetId: collection.datasetId,
          tags: collection.tags
        })
      }
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.RETRAIN_COLLECTION,
        params: {
          collectionName: collection.name,
          datasetName: collection.dataset?.name || '',
          datasetType: getI18nDatasetType(collection.dataset?.type || '')
        }
      });
    })();

    return ReTrainingCollectionResponseSchema.parse({ collectionId });
  });
}

export default NextAPI(handler);
