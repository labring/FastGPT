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
import { getDatasetCollectionPaths } from './paths';

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

  const collectionPaths = await getDatasetCollectionPaths({
    parentId: String(collection._id)
  });
  const parentResourceName = collectionPaths.at(-2)?.parentName ?? collection.dataset.name;
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
    params: {
      targetResource: [
        collection.dataset.name,
        ...collectionPaths.map((path) => path.parentName)
      ].join('/'),
      parentResource: parentResourceName
    }
  });
}

export default NextAPI(handler);
