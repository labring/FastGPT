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
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

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

  const parentCollection = collection.parentId
    ? await MongoDatasetCollection.findById(collection.parentId, 'name').lean()
    : undefined;
  const parentResourceName = collection.parentId ? parentCollection?.name : collection.dataset.name;

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

  // 权限恢复成功后才写入事件。
  addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
    resources: [
      { datasetId: String(collection.datasetId) },
      { collectionId: String(collection._id) }
    ],
    params: {
      targetResource: collection.name,
      ...(parentResourceName !== undefined ? { parentResource: parentResourceName } : {})
    }
  });
}

export default NextAPI(handler);
