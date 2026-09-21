import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { getCollectionCollaborators } from '@fastgpt/service/support/permission/collection/collaborator';
import { carryOverCollectionPermission } from '@fastgpt/service/support/permission/collection/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ReTrainingCollectionBodySchema,
  ReTrainingCollectionResponseSchema,
  type ReTrainingCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

async function handler(req: ApiRequestProps): Promise<ReTrainingCollectionResponseType> {
  const { collectionId: inputCollectionId, ...data } = parseApiInput({
    req,
    bodySchema: ReTrainingCollectionBodySchema
  }).body;

  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: inputCollectionId,
    per: WritePermissionVal
  });

  return mongoSessionRun(async (session) => {
    // 重训会以新 _id 重建 collection，而创建流程只写入默认快照（独立态仅 owner）：
    // 必须在删除原集合前留存其权限快照，并在新集合创建后写回，否则协作者配置会丢失。
    const collaborators = await getCollectionCollaborators({
      teamId,
      collectionId: inputCollectionId,
      session
    });

    await delCollection({
      collections: [collection],
      session,
      delImg: false,
      delFile: false
    });

    const { collectionId } = await createCollectionAndInsertData({
      dataset: collection.dataset,
      session,
      createCollectionParams: {
        ...collection,
        ...data,
        datasetId: collection.datasetId,
        teamId: collection.teamId,
        tmbId: collection.tmbId,
        parentId: collection.parentId ?? undefined,
        updateTime: new Date(),
        tags: await collectionTagsToTagLabel({
          datasetId: collection.datasetId,
          tags: collection.tags
        })
      }
    });

    await carryOverCollectionPermission({
      teamId,
      collectionId,
      collaborators,
      session
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
