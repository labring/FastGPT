import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { resumeCollectionInheritPermission } from '@fastgpt/service/support/permission/collection/controller';
import {
  ResumeCollectionInheritPermissionBodySchema,
  type ResumeCollectionInheritPermissionBody
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: ApiRequestProps<ResumeCollectionInheritPermissionBody>) {
  const { collectionId } = parseApiInput({
    req,
    bodySchema: ResumeCollectionInheritPermissionBodySchema
  }).body;

  const { collection, teamId, tmbId } = await authDatasetCollection({
    collectionId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  await resumeCollectionInheritPermission({
    collection: {
      _id: String(collection._id),
      tmbId: String(collection.tmbId),
      parentId: collection.parentId ? String(collection.parentId) : null,
      datasetId: String(collection.datasetId),
      type: collection.type,
      teamId: String(collection.teamId)
    }
  });

  (async () => {
    addAuditLog({
      tmbId: String(tmbId),
      teamId: String(teamId),
      event: AuditEventEnum.RESUME_COLLECTION_INHERIT_PERMISSION,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();
}

export default NextAPI(handler);
